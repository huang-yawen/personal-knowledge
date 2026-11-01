import { create } from "zustand";
import type { ThreadMessageLike } from "@assistant-ui/react";
import {
  deleteConversation,
  getConversation,
  listConversations,
  updateConversation,
  type ChatSource,
  type ConversationDto,
} from "@/lib/api";

type ChatState = {
  // 提问的知识库范围，空数组表示全部知识库
  knowledgeBaseIds: number[];
  // 当前对话最近一次回答的引用来源，由问答适配器写入、右侧面板读取
  sources: ChatSource[];
  conversations: ConversationDto[];
  // 侧栏的搜索词和“已归档”视图，刷新列表时沿用
  conversationQuery: string;
  showArchived: boolean;
  // 当前对话 id，null 表示还没有保存过的新对话
  conversationId: number | null;
  // 切换或新建对话时递增，用来重建对话运行时；对话中途获得 id 不会改变它
  threadKey: number;
  initialMessages: ThreadMessageLike[];
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
  sources: [],
  conversations: [],
  conversationQuery: "",
  showArchived: false,
  conversationId: null,
  threadKey: 0,
  initialMessages: [],
  setKnowledgeBaseIds: (knowledgeBaseIds) => set({ knowledgeBaseIds }),
  setSources: (sources) => set({ sources }),
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
      initialMessages: conversation.messages.map((message) => ({
        id: String(message.id),
        role: message.role,
        content: message.content,
        metadata: message.citations ? { custom: { sources: message.citations } } : undefined,
      })),
      threadKey: state.threadKey + 1,
    }));
  },
  newConversation: () =>
    set((state) => ({ conversationId: null, sources: [], initialMessages: [], threadKey: state.threadKey + 1 })),
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
