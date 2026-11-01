import type { ReactNode } from "react";
import {
  AssistantRuntimeProvider,
  useLocalRuntime,
  type ChatModelAdapter,
  type ThreadMessageLike,
} from "@assistant-ui/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { streamChat, type ChatSource } from "@/lib/api";
import { useChatStore } from "@/lib/chat-store";

// 调用后端 /api/chat：先收到对话 id 和引用来源，再逐段收到回答文字
const chatAdapter: ChatModelAdapter = {
  async *run({ messages, abortSignal }) {
    const { knowledgeBaseIds, conversationId, threadKey, setSources, setConversationId } = useChatStore.getState();
    // 回答期间用户可能切换了对话，旧回答不能再写入新对话的状态
    const isCurrentThread = () => useChatStore.getState().threadKey === threadKey;
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
    let sources: ChatSource[] = [];
    let followups: string[] = [];
    for await (const event of streamChat(history, knowledgeBaseIds, conversationId, abortSignal)) {
      if (event.type === "conversation") {
        if (isCurrentThread()) setConversationId(event.id);
      } else if (event.type === "sources") {
        sources = event.sources;
        if (isCurrentThread()) setSources(event.sources);
        // 来源在回答结束后才到达，需要再更新一次消息才能显示出来
        yield { content: [{ type: "text", text }], metadata: { custom: { sources, followups } } };
      } else if (event.type === "delta") {
        text += event.text;
        yield { content: [{ type: "text", text }], metadata: { custom: { sources, followups } } };
      } else if (event.type === "followups") {
        followups = event.items;
        yield { content: [{ type: "text", text }], metadata: { custom: { sources, followups } } };
      } else if (event.type === "done") {
        // 刷新列表，让新对话出现、标题和排序更新
        useChatStore.getState().loadConversations().catch(console.error);
      } else if (event.type === "error") throw new Error(event.message);
    }
  },
};

export function MyRuntimeProvider({ children, initialMessages }: { children: ReactNode; initialMessages: ThreadMessageLike[] }) {
  const runtime = useLocalRuntime(chatAdapter, { initialMessages });
  return <AssistantRuntimeProvider runtime={runtime}><TooltipProvider>{children}</TooltipProvider></AssistantRuntimeProvider>;
}
