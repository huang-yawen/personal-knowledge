import { create } from "zustand";
import type { ThreadMessageLike } from "@assistant-ui/react";
import {
  deleteConversation,
  getConversation,
  listConversations,
  type ChatSource,
  type ConversationDto,
} from "@/lib/api";

type ChatState = {
  // 提问的知识库范围，null 表示全部知识库
  knowledgeBaseId: number | null;
  // 当前对话最近一次回答的引用来源，由问答适配器写入、右侧面板读取
  sources: ChatSource[];
  conversations: ConversationDto[];
  // 当前对话 id，null 表示还没有保存过的新对话
  conversationId: number | null;
  // 切换或新建对话时递增，用来重建对话运行时；对话中途获得 id 不会改变它
  threadKey: number;
  initialMessages: ThreadMessageLike[];
  setKnowledgeBaseId: (id: number | null) => void;
  setSources: (sources: ChatSource[]) => void;
  setConversationId: (id: number) => void;
  loadConversations: () => Promise<void>;
  openConversation: (id: number) => Promise<void>;
  newConversation: () => void;
  removeConversation: (id: number) => Promise<void>;
};

export const useChatStore = create<ChatState>()((set, get) => ({
  knowledgeBaseId: null,
  sources: [],
  conversations: [],
  conversationId: null,
  threadKey: 0,
  initialMessages: [],
  setKnowledgeBaseId: (knowledgeBaseId) => set({ knowledgeBaseId }),
  setSources: (sources) => set({ sources }),
  setConversationId: (conversationId) => set({ conversationId }),
  loadConversations: async () => set({ conversations: await listConversations() }),
  openConversation: async (id) => {
    const conversation = await getConversation(id);
    const lastAnswer = conversation.messages.findLast((message) => message.role === "assistant");
    set((state) => ({
      conversationId: id,
      knowledgeBaseId: conversation.knowledgeBaseId,
      sources: lastAnswer?.citations ?? [],
      initialMessages: conversation.messages.map((message) => ({ id: String(message.id), role: message.role, content: message.content })),
      threadKey: state.threadKey + 1,
    }));
  },
  newConversation: () =>
    set((state) => ({ conversationId: null, sources: [], initialMessages: [], threadKey: state.threadKey + 1 })),
  removeConversation: async (id) => {
    await deleteConversation(id);
    if (get().conversationId === id) get().newConversation();
    await get().loadConversations();
  },
}));
