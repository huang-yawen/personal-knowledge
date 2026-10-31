import type { ReactNode } from "react";
import {
  AssistantRuntimeProvider,
  useLocalRuntime,
  type ChatModelAdapter,
} from "@assistant-ui/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { streamChat } from "@/lib/api";
import { useChatStore } from "@/lib/chat-store";

// 调用后端 /api/chat：先收到引用来源，再逐段收到回答文字
const chatAdapter: ChatModelAdapter = {
  async *run({ messages, abortSignal }) {
    const { knowledgeBaseId, setSources } = useChatStore.getState();
    setSources([]);

    const history = messages.flatMap((message) => {
      if (message.role !== "user" && message.role !== "assistant") return [];
      const content = message.content
        .filter((part) => part.type === "text")
        .map((part) => part.text)
        .join("");
      return content ? [{ role: message.role, content }] : [];
    });

    let text = "";
    for await (const event of streamChat(history, knowledgeBaseId, abortSignal)) {
      if (event.type === "sources") setSources(event.sources);
      else if (event.type === "delta") {
        text += event.text;
        yield { content: [{ type: "text", text }] };
      } else if (event.type === "error") throw new Error(event.message);
    }
  },
};

export function MyRuntimeProvider({ children }: { children: ReactNode }) {
  const runtime = useLocalRuntime(chatAdapter);
  return <AssistantRuntimeProvider runtime={runtime}><TooltipProvider>{children}</TooltipProvider></AssistantRuntimeProvider>;
}
