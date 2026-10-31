import { Router, type Response } from "express";
import { config } from "../../config";
import { parseOptionalId, retrieveChunks, type RetrievedChunk } from "../rag/retrieve";
import {
  conversationExists,
  createConversation,
  makeTitle,
  saveAssistantMessage,
  syncMessages,
  touchConversation,
  type ChatMessage,
} from "../conversation/repository";
import { buildSystemPrompt, NO_MATERIAL_REPLY } from "./prompt";

type Usage = { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };

// 模型服务返回的错误，文案可以直接展示给用户
class ModelError extends Error {}

const parseMessages = (value: unknown): ChatMessage[] | undefined => {
  if (!Array.isArray(value) || value.length === 0) return undefined;
  const messages: ChatMessage[] = [];
  for (const item of value) {
    const { role, content } = (typeof item === "object" && item !== null ? item : {}) as Record<string, unknown>;
    if ((role !== "user" && role !== "assistant") || typeof content !== "string") return undefined;
    if (content.length > config.chat.maxMessageChars) return undefined;
    messages.push({ role, content });
  }
  const last = messages.at(-1);
  return last?.role === "user" && last.content.trim() ? messages : undefined;
};

// 调用 DeepSeek 流式接口，逐段回调文字，返回 token 用量。关闭思考模式以降低首字延迟和费用
const streamAnswer = async (
  messages: ChatMessage[],
  chunks: RetrievedChunk[],
  signal: AbortSignal,
  onDelta: (text: string) => void,
) => {
  const response = await fetch(`${config.deepseek.baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.deepseek.apiKey}` },
    body: JSON.stringify({
      model: config.deepseek.model,
      messages: [{ role: "system", content: buildSystemPrompt(chunks) }, ...messages],
      stream: true,
      stream_options: { include_usage: true },
      thinking: { type: "disabled" },
      max_tokens: config.chat.maxAnswerTokens,
    }),
    signal: AbortSignal.any([signal, AbortSignal.timeout(120_000)]),
  });
  if (!response.ok || !response.body) {
    console.error("模型服务请求失败", response.status, (await response.text()).slice(0, 300));
    throw new ModelError(`模型服务请求失败（HTTP ${response.status}）`);
  }

  let usage: Usage | undefined;
  const handleLine = (line: string) => {
    if (!line.startsWith("data:")) return;
    const payload = line.slice(5).trim();
    if (!payload || payload === "[DONE]") return;
    const data = JSON.parse(payload) as { choices?: { delta?: { content?: string | null } }[]; usage?: Usage };
    const text = data.choices?.[0]?.delta?.content;
    if (text) onDelta(text);
    if (data.usage) usage = data.usage;
  };

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    for (let index = buffer.indexOf("\n"); index >= 0; index = buffer.indexOf("\n")) {
      handleLine(buffer.slice(0, index).trim());
      buffer = buffer.slice(index + 1);
    }
  }
  handleLine(buffer.trim());
  return usage;
};

const writeEvent = (res: Response, event: object) => res.write(`data: ${JSON.stringify(event)}\n\n`);

export const chatRouter = Router();

// 事件依次为 sources（引用）→ delta（文字片段，多次）→ done；出错时发送 error
chatRouter.post("/", async (req, res) => {
  const body = (typeof req.body === "object" && req.body !== null ? req.body : {}) as Record<string, unknown>;
  const messages = parseMessages(body.messages);
  const knowledgeBaseId = parseOptionalId(body.knowledgeBaseId);
  const conversationId = parseOptionalId(body.conversationId);
  if (!messages) {
    res.status(400).json({ error: `消息格式不正确（最后一条需为用户消息，单条不超过 ${config.chat.maxMessageChars} 字）` });
    return;
  }
  if (knowledgeBaseId === "invalid" || conversationId === "invalid") {
    res.status(400).json({ error: "知识库范围或对话 id 不正确" });
    return;
  }
  if (conversationId !== undefined && !(await conversationExists(conversationId))) {
    res.status(404).json({ error: "对话不存在" });
    return;
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });

  // 用户点击停止或关闭页面时，同步中止对模型服务的请求
  const controller = new AbortController();
  res.on("close", () => controller.abort());

  const startedAt = Date.now();
  const question = messages[messages.length - 1].content.trim();
  let hits = 0;
  let topScore: number | undefined;
  let usage: Usage | undefined;
  try {
    // 先落库：保存用户的提问，并让库里的历史与界面一致（含重新生成、编辑后重发的情况）
    const activeConversationId =
      conversationId ?? (await createConversation(makeTitle(messages.find((m) => m.role === "user")?.content ?? ""), knowledgeBaseId));
    await syncMessages(activeConversationId, messages);
    await touchConversation(activeConversationId, knowledgeBaseId);
    writeEvent(res, { type: "conversation", id: activeConversationId });

    const chunks = await retrieveChunks(question, { knowledgeBaseId });
    hits = chunks.length;
    topScore = chunks[0]?.score;
    const sources = chunks.map((chunk, index) => ({ index: index + 1, ...chunk }));
    writeEvent(res, { type: "sources", sources });

    let answer = "";
    const onDelta = (text: string) => {
      answer += text;
      writeEvent(res, { type: "delta", text });
    };
    if (chunks.length === 0) {
      onDelta(NO_MATERIAL_REPLY);
    } else {
      usage = await streamAnswer(messages.slice(-config.chat.maxHistoryMessages), chunks, controller.signal, onDelta);
    }
    // 回答完整结束后才保存；中途停止的不入库，下次发送时界面历史会带上它
    if (answer) await saveAssistantMessage(activeConversationId, answer, sources);
    writeEvent(res, { type: "done", usage });
  } catch (error) {
    if (!controller.signal.aborted) {
      console.error("问答失败", error);
      writeEvent(res, { type: "error", message: error instanceof ModelError ? error.message : "回答生成失败，请稍后重试" });
    }
  } finally {
    res.end();
    // 记录检索参数与用量，便于排查幻觉和成本；不记录问题和回答内容
    console.log(
      JSON.stringify({
        event: "chat",
        knowledgeBaseId: knowledgeBaseId ?? null,
        questionChars: question.length,
        hits,
        topScore: topScore === undefined ? null : Number(topScore.toFixed(3)),
        model: config.deepseek.model,
        usage: usage ?? null,
        aborted: controller.signal.aborted,
        ms: Date.now() - startedAt,
      }),
    );
  }
});
