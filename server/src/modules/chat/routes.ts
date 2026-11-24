import { Router, type Response } from "express";
import type { RowDataPacket } from "mysql2";
import { config } from "../../config";
import { pool } from "../../db";
import { currentUserId, runAsUser } from "../auth/context";
import {
  describeRetrievalError,
  emptyRetrievalStats,
  ownsKnowledgeBases,
  parseIdList,
  parseOptionalId,
  retrieveChunks,
  type RetrievedChunk,
} from "../rag/retrieve";
import { buildRetrievalQuery } from "../rag/query";
import {
  conversationExists,
  createConversation,
  makeTitle,
  saveAssistantMessage,
  syncMessages,
  touchConversation,
  type ChatMessage,
} from "../conversation/repository";
import { estimateTokens, recordUsage } from "../usage";
import { getSettings, type ReplyStyle } from "../settings/repository";
import { buildSystemPrompt, PROMPT_VERSION, type PromptOptions } from "./prompt";
import { loadConversationSummary, refreshConversationSummary } from "../conversation/summary";
import { CHUNKER_VERSION } from "../worker/chunk";

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
  style: ReplyStyle,
  promptOptions: PromptOptions,
  signal: AbortSignal,
  onDelta: (text: string) => void,
) => {
  const response = await fetch(`${config.deepseek.baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.deepseek.apiKey}` },
    body: JSON.stringify({
      model: config.deepseek.model,
      messages: [{ role: "system", content: buildSystemPrompt(chunks, style, promptOptions) }, ...messages],
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

// 回答指令：限定了知识库范围时取范围内的，未限定（全部知识库）时取实际命中资料所在的知识库
const loadInstructions = async (knowledgeBaseIds: number[], chunks: RetrievedChunk[]) => {
  const ids = knowledgeBaseIds.length > 0 ? knowledgeBaseIds : [...new Set(chunks.map((chunk) => chunk.knowledgeBaseId))];
  if (ids.length === 0) return [];
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT name, instructions FROM knowledge_bases WHERE user_id = ? AND id IN (?) AND instructions <> ''",
    [currentUserId(), ids],
  );
  return rows.map((row) => ({ name: row.name as string, text: row.instructions as string }));
};

// 根据问答生成追问建议：非流式短调用，失败时返回空数组，不影响主回答
const generateFollowups = async (
  question: string,
  answer: string,
  signal: AbortSignal,
): Promise<{ items: string[]; tokens: number | undefined }> => {
  try {
    const response = await fetch(`${config.deepseek.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.deepseek.apiKey}` },
      body: JSON.stringify({
        model: config.deepseek.model,
        messages: [
          {
            role: "system",
            content:
              "根据用户的提问和助手的回答，给出 3 个用户可能接着问的简短问题。每行一个，不要编号、引号或多余说明，每个不超过 30 字，使用与提问相同的语言。",
          },
          { role: "user", content: `提问：${question.slice(0, 500)}\n\n回答：${answer.slice(0, 1500)}` },
        ],
        thinking: { type: "disabled" },
        max_tokens: 150,
      }),
      signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]),
    });
    if (!response.ok) return { items: [], tokens: undefined };
    const data = (await response.json()) as { choices?: { message?: { content?: string | null } }[]; usage?: { total_tokens?: number } };
    const items = (data.choices?.[0]?.message?.content ?? "")
      .split("\n")
      .map((line) => line.replace(/^\s*(?:[-*\d.、)]+\s*)/, "").trim())
      .filter((line) => line.length > 0 && line.length <= 60)
      .slice(0, 3);
    return { items, tokens: data.usage?.total_tokens };
  } catch (error) {
    if (!signal.aborted) console.error("追问建议生成失败", error);
    return { items: [], tokens: undefined };
  }
};

// 回答里引用的资料编号，支持 [1]、[1][2]、[1, 2] 这几种写法
const citedIndexes = (answer: string) => {
  const indexes = new Set<number>();
  for (const match of answer.matchAll(/\[(\d+(?:\s*[,，、]\s*\d+)*)\]/g)) {
    for (const part of match[1].split(/[,，、]/)) indexes.add(Number(part));
  }
  return indexes;
};

const writeEvent = (res: Response, event: object) => {
  // 客户端断开后继续写会抛错或堆积；统一在这里挡掉，调用方不用感知连接状态
  if (res.writableEnded || res.destroyed) return;
  res.write(`data: ${JSON.stringify(event)}\n\n`);
};

export const chatRouter = Router();

// 事件依次为 conversation → delta（文字片段，多次）→ sources（回答里实际引用的来源）→ followups → done；出错时发送 error
chatRouter.post("/", async (req, res) => {
  // 提前取一次：响应结束后刷新摘要时已经不在请求上下文里了
  const userId = currentUserId();
  const body = (typeof req.body === "object" && req.body !== null ? req.body : {}) as Record<string, unknown>;
  const messages = parseMessages(body.messages);
  const knowledgeBaseIds = parseIdList(body.knowledgeBaseIds);
  const conversationId = parseOptionalId(body.conversationId);
  if (!messages) {
    res.status(400).json({ error: `消息格式不正确（最后一条需为用户消息，单条不超过 ${config.chat.maxMessageChars} 字）` });
    return;
  }
  if (knowledgeBaseIds === "invalid" || conversationId === "invalid") {
    res.status(400).json({ error: "知识库范围或对话 id 不正确" });
    return;
  }
  if (!(await ownsKnowledgeBases(knowledgeBaseIds))) {
    res.status(404).json({ error: "知识库不存在" });
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

  // 检索 + 精排要几百毫秒到几秒，先推一个阶段事件，别让用户以为卡住了
  writeEvent(res, { type: "stage", stage: "retrieving" });

  // 长连接心跳：代理和浏览器可能把长时间没有数据的连接判成空闲
  const heartbeat = setInterval(() => {
    if (!res.writableEnded && !res.destroyed) res.write(": ping\n\n");
  }, 15_000);

  // 用户点击停止或关闭页面时，同步中止对模型服务的请求
  const controller = new AbortController();
  res.on("close", () => controller.abort());

  const startedAt = Date.now();
  const question = messages[messages.length - 1].content.trim();
  // 检索用的查询串：追问会拼上上一轮的问题，可能与用户原话不同（只影响检索，发给模型的仍是原话）
  let retrievalQuery = question;
  // 实际进入提示词的相似度，用来标定相关性下限
  let scores: number[] = [];
  const retrievalStats = emptyRetrievalStats();
  let hits = 0;
  let topScore: number | undefined;
  let usage: Usage | undefined;
  let answer = "";
  // 回答里引用了、但不存在于本次资料列表的编号数；只记日志，用于观察引用幻觉
  let invalidCitations = 0;
  // 中止时要在这里保存已生成的内容，所以放到 try 外面
  let activeConversationId: number | undefined;
  let retrieved: (RetrievedChunk & { index: number })[] = [];
  // 分段耗时（毫秒），写入日志便于定位慢在检索还是生成
  let retrievalMs: number | undefined;
  let firstTokenMs: number | undefined;
  let followupMs: number | undefined;
  // 本次请求实际生效的 AI 设置，写进检索诊断
  let requestSettings: { topK: number; strictMode: boolean; replyStyle: ReplyStyle } | undefined;

  const truncate = (text: string, max: number) => Array.from(text).slice(0, max).join("");
  // 一条回答的检索诊断：出问题时能按当时的分块、分数和配置回放，而不是只靠日志
  const buildRetrievalMeta = () => ({
    retrievalQuery: truncate(retrievalQuery, 2000),
    rewritten: retrievalQuery !== question,
    invalidCitations,
    stages: {
      retrievalMs: retrievalMs ?? null,
      firstTokenMs: firstTokenMs ?? null,
      followupMs: followupMs ?? null,
      totalMs: Date.now() - startedAt,
    },
    retrieval: {
      candidates: retrievalStats.candidates,
      filtered: retrievalStats.filtered,
      keywordHits: retrievalStats.keywordHits,
      scores,
      topScore: topScore === undefined ? null : Number(topScore.toFixed(3)),
      rerank: {
        applied: retrievalStats.rerankApplied,
        degraded: retrievalStats.rerankDegraded,
        ms: retrievalStats.rerankMs,
        scores: retrievalStats.rerankScores,
      },
    },
    chunks: retrieved.map((chunk) => ({
      chunkId: chunk.chunkId,
      documentId: chunk.documentId,
      documentName: chunk.documentName,
      page: chunk.page,
      score: Number(chunk.score.toFixed(3)),
      rerankScore: chunk.rerankScore === undefined ? null : Number(chunk.rerankScore.toFixed(3)),
      matchedBy: chunk.matchedBy,
    })),
    config: {
      topK: requestSettings?.topK ?? config.retrieval.topK,
      strictMode: requestSettings?.strictMode ?? false,
      replyStyle: requestSettings?.replyStyle ?? "balanced",
      minScore: config.retrieval.minScore,
      recallMinScore: config.retrieval.recallMinScore,
      recallMultiplier: config.retrieval.recallMultiplier,
      maxCandidates: config.retrieval.maxCandidates,
      hybrid: {
        enabled: config.retrieval.hybrid.enabled,
        keywordLimit: config.retrieval.hybrid.keywordLimit,
        rrfK: config.retrieval.hybrid.rrfK,
      },
      rerank: {
        enabled: config.rerank.enabled,
        shadow: config.rerank.shadow,
        model: config.rerank.model,
        minScore: config.rerank.minScore ?? null,
        timeoutMs: config.rerank.timeoutMs,
      },
      embeddingModel: config.embedding.model,
      chatModel: config.deepseek.model,
      chunkerVersion: CHUNKER_VERSION,
      promptVersion: PROMPT_VERSION,
    },
  });
  try {
    // 先落库：保存用户的提问，并让库里的历史与界面一致（含重新生成、编辑后重发的情况）
    activeConversationId =
      conversationId ?? (await createConversation(makeTitle(messages.find((m) => m.role === "user")?.content ?? ""), knowledgeBaseIds));
    await syncMessages(activeConversationId, messages);
    await touchConversation(activeConversationId, knowledgeBaseIds);
    writeEvent(res, { type: "conversation", id: activeConversationId });

    const settings = await getSettings();
    requestSettings = { topK: settings.topK, strictMode: settings.strictMode, replyStyle: settings.replyStyle };
    // 更早的对话被压缩成的摘要：长对话里最近 N 条之外的内容靠它传下去
    const historySummary = await loadConversationSummary(activeConversationId);
    // 追问（“它有什么优点”“第二点展开说说”）单独去做向量检索没有主语，先拼上上一轮的问题
    retrievalQuery = buildRetrievalQuery(question, messages.slice(0, -1));
    const retrievalStartedAt = Date.now();
    const chunks = await retrieveChunks(retrievalQuery, {
      knowledgeBaseIds,
      limit: settings.topK,
      stats: retrievalStats,
      // 判断相关性用用户原话，而不是拼接过的检索串
      rerankQuery: question,
      // 精排是检索里最慢的一段，单独告诉前端现在卡在哪
      onStage: (stage) => {
        if (!controller.signal.aborted) writeEvent(res, { type: "stage", stage });
      },
    }).catch((error: unknown) => {
      console.error("检索失败", error);
      throw new ModelError(describeRetrievalError(error));
    });
    retrievalMs = Date.now() - retrievalStartedAt;
    if (!controller.signal.aborted) {
      writeEvent(res, { type: "stage", stage: "generating", hits: chunks.length });
    }
    hits = chunks.length;
    scores = chunks.map((chunk) => Number(chunk.score.toFixed(3)));
    // 精排后第一条不一定是向量分最高的那条，所以取最大值
    topScore = scores.length > 0 ? Math.max(...scores) : undefined;
    const instructions = await loadInstructions(knowledgeBaseIds, chunks);
    retrieved = chunks.map((chunk, index) => ({ index: index + 1, ...chunk }));

    const onDelta = (text: string) => {
      firstTokenMs ??= Date.now() - startedAt;
      answer += text;
      writeEvent(res, { type: "delta", text });
    };
    // 没有检索到资料时也照常调用模型，由提示词引导它用自身知识回答
    usage = await streamAnswer(messages.slice(-config.chat.maxHistoryMessages), chunks, settings.replyStyle, { strict: settings.strictMode, instructions, historySummary }, controller.signal, onDelta);
    // 只展示回答里真正用 [编号] 引用到的来源；模型用自身知识回答时没有来源
    const cited = citedIndexes(answer);
    invalidCitations = [...cited].filter((index) => index < 1 || index > retrieved.length).length;
    const sources = retrieved.filter((source) => cited.has(source.index));
    writeEvent(res, { type: "sources", sources });
    // 完整结束后保存；中途被停止的在 catch 里另存一份并标记为未完成
    if (answer) {
      const retrievalMeta = buildRetrievalMeta();
      const messageId = await saveAssistantMessage(activeConversationId, answer, sources, false, retrievalMeta);
      // 告诉前端这条回答的消息 id 和检索诊断，点踩时用它关联反馈
      writeEvent(res, { type: "saved", messageId, retrievalMeta });
    }
    // 追问建议不入库，仅随本次回答展示
    if (answer && !controller.signal.aborted) {
      const followupStartedAt = Date.now();
      const followups = await generateFollowups(question, answer, controller.signal);
      followupMs = Date.now() - followupStartedAt;
      recordUsage("followup", followups.tokens);
      if (followups.items.length > 0) writeEvent(res, { type: "followups", items: followups.items });
    }
    writeEvent(res, { type: "done", usage });
  } catch (error) {
    if (!controller.signal.aborted) {
      console.error("问答失败", error);
      writeEvent(res, { type: "error", message: error instanceof ModelError ? error.message : "回答生成失败，请稍后重试" });
    } else if (activeConversationId !== undefined && answer.trim()) {
      // 用户点了停止或关掉页面：把已经生成的部分存下来并标记为未完成。
      // 不存的话刷新后这段内容凭空消失，用户会以为白等了。
      const cited = citedIndexes(answer);
      invalidCitations = [...cited].filter((index) => index < 1 || index > retrieved.length).length;
      const sources = retrieved.filter((source) => cited.has(source.index));
      await saveAssistantMessage(activeConversationId, answer, sources, true, retrieved.length > 0 ? buildRetrievalMeta() : undefined).catch((saveError: unknown) =>
        console.error("保存中止的回答失败", saveError),
      );
    }
  } finally {
    clearInterval(heartbeat);
    res.end();
    // 回答结束后按需刷新对话摘要：不阻塞本次响应，下一轮提问时就能用上。
    // 放在响应之后是因为它要额外调一次模型，不该拖慢首字
    const summaryConversationId = activeConversationId;
    if (summaryConversationId !== undefined && answer.trim()) {
      void runAsUser(userId, () => refreshConversationSummary(summaryConversationId)).catch((error: unknown) =>
        console.error("刷新对话摘要失败", error),
      );
    }
    // 记账：正常结束用模型返回的 usage；中途停止拿不到时按字数估算
    if (usage || answer) recordUsage("chat", usage?.total_tokens ?? estimateTokens(question.length + answer.length));
    // 记录检索参数与用量，便于排查幻觉和成本；不记录问题和回答内容
    console.log(
      JSON.stringify({
        event: "chat",
        knowledgeBaseIds,
        questionChars: question.length,
        // 是否拼接了上一轮问题（追问）；检索命中数和分数用来标定 RETRIEVAL_MIN_SCORE
        rewritten: retrievalQuery !== question,
        candidates: retrievalStats.candidates,
        filtered: retrievalStats.filtered,
        // 混合检索：是否开启、关键词那一路命中多少
        hybrid: config.retrieval.hybrid.enabled,
        keywordHits: retrievalStats.keywordHits,
        hits,
        scores,
        // 引用了不存在的编号（模型幻觉），前端会标红并汇总提示
        invalidCitations,
        topScore: topScore === undefined ? null : Number(topScore.toFixed(3)),
        minScore: config.retrieval.minScore,
        // 精排：applied=实际调用了，degraded=服务不可用已退回向量排序，shadow=只记录未改变结果
        reranked: retrievalStats.rerankApplied,
        rerankDegraded: retrievalStats.rerankDegraded,
        rerankShadow: config.rerank.shadow,
        rerankMs: retrievalStats.rerankMs,
        rerankScores: retrievalStats.rerankScores,
        model: config.deepseek.model,
        usage: usage ?? null,
        aborted: controller.signal.aborted,
        retrievalMs: retrievalMs ?? null,
        firstTokenMs: firstTokenMs ?? null,
        followupMs: followupMs ?? null,
        ms: Date.now() - startedAt,
      }),
    );
  }
});
