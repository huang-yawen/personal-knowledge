import { create } from "zustand";
import type { ChatSource } from "@/lib/api";

type ChatState = {
  // 提问的知识库范围，null 表示全部知识库
  knowledgeBaseId: number | null;
  // 最近一次回答的引用来源，由问答适配器写入、右侧面板读取
  sources: ChatSource[];
  setKnowledgeBaseId: (id: number | null) => void;
  setSources: (sources: ChatSource[]) => void;
};

export const useChatStore = create<ChatState>()((set) => ({
  knowledgeBaseId: null,
  sources: [],
  setKnowledgeBaseId: (knowledgeBaseId) => set({ knowledgeBaseId }),
  setSources: (sources) => set({ sources }),
}));
