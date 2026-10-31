import type { ReactNode } from "react";
import {
  AssistantRuntimeProvider,
  useLocalRuntime,
  type ChatModelAdapter,
} from "@assistant-ui/react";
import { TooltipProvider } from "@/components/ui/tooltip";

// Local adapter used while the DeepSeek + RAG SSE endpoint is not connected.
// Its contract matches the future streaming adapter, so the UI needs no rewrite.
const localModelAdapter: ChatModelAdapter = {
  async *run({ messages, abortSignal }) {
    const last = messages[messages.length - 1];
    const userText =
      last?.content
        ?.filter((content) => content.type === "text")
        .map((content) => content.text)
        .join("") ?? "";

    const reply = userText.trim()
      ? `我收到了你的问题：**${userText}**\n\n当前是 Personal Knowledge 的本地 AI 对话演示。接入 RAG 服务后，我会先从你选择的知识库中检索相关片段，再基于资料生成带引用的回答。\n\n你可以继续追问，或在上方选择知识库范围。`
      : "你好！我是 Personal Knowledge 助手。选择知识库后，我可以基于你的资料协助检索、理解和整理知识。";

    let text = "";
    for (const character of reply) {
      if (abortSignal?.aborted) return;
      text += character;
      yield { content: [{ type: "text", text }] };
      await new Promise((resolve) => setTimeout(resolve, 8));
    }
  },
};

export function MyRuntimeProvider({ children }: { children: ReactNode }) {
  const runtime = useLocalRuntime(localModelAdapter);
  return <AssistantRuntimeProvider runtime={runtime}><TooltipProvider>{children}</TooltipProvider></AssistantRuntimeProvider>;
}
