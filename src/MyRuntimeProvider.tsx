import type { ReactNode } from "react";
import {
  AssistantRuntimeProvider,
  useLocalRuntime,
  type ChatModelAdapter,
  type FeedbackAdapter,
  type ThreadMessageLike,
} from "@assistant-ui/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { streamChat, submitMessageFeedback, type ChatSource, type RetrievalMeta } from "@/lib/api";
import { useChatStore } from "@/lib/chat-store";
import { useFeedbackStore } from "@/lib/feedback-store";
import { errorMessage } from "@/lib/utils";

// 后端对话接口只接收文字；这些是它收不了的内容类型（粘贴图片等仍可能产生）
const ATTACHMENT_PARTS = new Set(["file", "image", "audio"]);

// 点赞/点踩：assistant-ui 的按钮已在 thread.aui.tsx 里，这里只负责把结果落库。
// 点踩先记「没帮助」，再弹窗让用户补原因；即使关掉弹窗，这条负反馈也不会丢。
const feedbackAdapter: FeedbackAdapter = {
  submit: async ({ message, type }) => {
    const messageId = (message.metadata?.custom as { messageId?: number } | undefined)?.messageId;
    if (typeof messageId !== "number") {
      useFeedbackStore.getState().notify("这条回答还没有保存完成，暂时无法反馈", "error");
      return;
    }
    try {
      await submitMessageFeedback(messageId, { rating: type });
      if (type === "negative") useFeedbackStore.getState().open(messageId);
      else useFeedbackStore.getState().notify("感谢反馈", "success");
    } catch (reason) {
      useFeedbackStore.getState().notify(errorMessage(reason), "error");
    }
  },
};

// 调用后端 /api/chat：先收到对话 id 和引用来源，再逐段收到回答文字
const chatAdapter: ChatModelAdapter = {
  async *run({ messages, abortSignal }) {
    const { knowledgeBaseIds, conversationId, threadKey, setSources, setStage, setConversationId } = useChatStore.getState();
    // 回答期间用户可能切换了对话，旧回答不能再写入新对话的状态
    const isCurrentThread = () => useChatStore.getState().threadKey === threadKey;
    setSources([]);

    // 没有附件界面后，理论上不会再产生附件；万一有（如粘贴图片），明确告知而不是静默丢弃
    if (messages.some((message) => message.content.some((part) => ATTACHMENT_PARTS.has(part.type)))) {
      throw new Error("对话只支持文字提问：请先在「我的知识库」上传文件，处理完成后就能在回答里引用它。");
    }

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
    // 回答落库后由 saved 事件带回，写进消息 metadata 供点踩和诊断使用
    let messageId: number | undefined;
    let retrievalMeta: RetrievalMeta | undefined;
    const messageMetadata = () => ({
      custom: {
        sources,
        followups,
        ...(messageId === undefined ? {} : { messageId }),
        ...(retrievalMeta === undefined ? {} : { retrievalMeta }),
      },
    });
    try {
      for await (const event of streamChat(history, knowledgeBaseIds, conversationId, abortSignal)) {
        if (event.type === "conversation") {
          if (isCurrentThread()) setConversationId(event.id);
        } else if (event.type === "stage") {
          // 只更新状态栏，不写进消息内容，避免污染历史记录
          if (isCurrentThread()) setStage({ name: event.stage, hits: event.hits });
        } else if (event.type === "sources") {
          sources = event.sources;
          if (isCurrentThread()) setSources(event.sources);
          // 来源在回答结束后才到达，需要再更新一次消息才能显示出来
          yield { content: [{ type: "text", text }], metadata: messageMetadata() };
        } else if (event.type === "delta") {
          text += event.text;
          yield { content: [{ type: "text", text }], metadata: messageMetadata() };
        } else if (event.type === "saved") {
          messageId = event.messageId;
          retrievalMeta = event.retrievalMeta;
          // 再推一次消息，把 id 和检索诊断带进 metadata；不改变正文
          yield { content: [{ type: "text", text }], metadata: messageMetadata() };
        } else if (event.type === "followups") {
          followups = event.items;
          yield { content: [{ type: "text", text }], metadata: messageMetadata() };
        } else if (event.type === "done") {
          // 刷新列表，让新对话出现、标题和排序更新
          useChatStore.getState().loadConversations().catch(console.error);
        } else if (event.type === "error") throw new Error(event.message);
      }
    } finally {
      // 正常结束、报错、用户中断都要清掉阶段提示；切到别的对话时由那边自己管理
      if (isCurrentThread()) setStage(null);
    }
  },
};

export function MyRuntimeProvider({ children, initialMessages }: { children: ReactNode; initialMessages: ThreadMessageLike[] }) {
  // 传了 feedback adapter 后，thread.aui.tsx 里的点赞/点踩按钮才会显示
  const runtime = useLocalRuntime(chatAdapter, { initialMessages, adapters: { feedback: feedbackAdapter } });
  return <AssistantRuntimeProvider runtime={runtime}><TooltipProvider>{children}</TooltipProvider></AssistantRuntimeProvider>;
}
