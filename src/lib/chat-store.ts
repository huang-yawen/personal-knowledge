import { create } from "zustand";
import type { ThreadMessageLike } from "@assistant-ui/react";
import {
  deleteConversation,
  getConversation,
  listConversations,
  updateConversation,
  type ChatSource,
  type ChatStageName,
  type ConversationDto,
} from "@/lib/api";

// 当前回答处于哪个阶段；hits 只在 generating 时有意义
export type ChatStage = { name: ChatStageName; hits?: number };

type ChatState = {
  // 提问的知识库范围，空数组表示全部知识库
  knowledgeBaseIds: number[];
  // 当前对话最近一次回答的引用来源，由问答适配器写入、右侧面板读取
  sources: ChatSource[];
  // 当前回答所处的阶段，null 表示空闲
  stage: ChatStage | null;
  setStage: (stage: ChatStage | null) => void;
  conversations: ConversationDto[];
  // 侧栏的搜索词和“已归档”视图，刷新列表时沿用
  conversationQuery: string;
  showArchived: boolean;
  // 当前对话 id，null 表示还没有保存过的新对话
  conversationId: number | null;
  // 切换或新建对话时递增，用来重建对话运行时；对话中途获得 id 不会改变它
  threadKey: number;
  initialMessages: ThreadMessageLike[];
  // 从别处（如文档摘要里的推荐问题）带来的待提问内容，对话页读取后填入输入框并清空
  pendingQuestion: string | null;
  setPendingQuestion: (question: string | null) => void;
  setKnowledgeBaseIds: (ids: number[]) => void;
  setSources: (sources: ChatSource[]) => void;
  setConversationId: (id: number) => void;
  setConversationFilter: (query: string, showArchived: boolean) => Promise<void>;
  loadConversations: () => Promise<void>;
  openConversation: (id: number) => Promise<void>;
  newConversation: () => void;
  patchConversation: (id: number, patch: { title?: string; isFavorite?: boolean; archived?: boolean }) => Promise<void>;
  removeConversation: (id: number) => Promise<void>;
};

export const useChatStore = create<ChatState>()((set, get) => ({
  knowledgeBaseIds: [],
  pendingQuestion: null,
  sources: [],
  stage: null,
  conversations: [],
  conversationQuery: "",
  showArchived: false,
  conversationId: null,
  threadKey: 0,
  initialMessages: [],
  setPendingQuestion: (pendingQuestion) => set({ pendingQuestion }),
  setKnowledgeBaseIds: (knowledgeBaseIds) => set({ knowledgeBaseIds }),
  setSources: (sources) => set({ sources }),
  setStage: (stage) => set({ stage }),
  setConversationId: (conversationId) => set({ conversationId }),
  setConversationFilter: async (conversationQuery, showArchived) => {
    set({ conversationQuery, showArchived });
    await get().loadConversations();
  },
  loadConversations: async () => {
    const { conversationQuery, showArchived } = get();
    set({ conversations: await listConversations(conversationQuery, showArchived) });
  },
  openConversation: async (id) => {
    const conversation = await getConversation(id);
    const lastAnswer = conversation.messages.findLast((message) => message.role === "assistant");
    set((state) => ({
      conversationId: id,
      knowledgeBaseIds: conversation.knowledgeBaseIds,
      sources: lastAnswer?.citations ?? [],
      // 切对话时上一个回答的阶段一定已经结束，避免状态串到新对话
      stage: null,
      initialMessages: conversation.messages.map((message) => ({
        id: String(message.id),
        role: message.role,
        content: message.content,
        // 助手消息始终带 messageId：历史回答也要能点赞/点踩
        metadata:
          message.role === "assistant"
            ? { custom: { messageId: message.id, sources: message.citations ?? [], incomplete: message.incomplete } }
            : undefined,
      })),
      threadKey: state.threadKey + 1,
    }));
  },  
  newConversation: () =>
    set((state) => ({ conversationId: null, sources: [], stage: null, initialMessages: [], threadKey: state.threadKey + 1 })),
  patchConversation: async (id, patch) => {
    await updateConversation(id, patch);
    await get().loadConversations();
  },
  removeConversation: async (id) => {
    await deleteConversation(id);
    if (get().conversationId === id) get().newConversation();
    await get().loadConversations();
  },
}));
