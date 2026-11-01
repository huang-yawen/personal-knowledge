import { create } from "zustand";

type ReaderState = {
  // 当前打开的文档与要定位的分块，documentId 为 null 表示阅读视图关闭
  documentId: number | null;
  chunkId: number | null;
  open: (documentId: number, chunkId?: number) => void;
  close: () => void;
};

export const useReaderStore = create<ReaderState>()((set) => ({
  documentId: null,
  chunkId: null,
  open: (documentId, chunkId) => set({ documentId, chunkId: chunkId ?? null }),
  close: () => set({ documentId: null, chunkId: null }),
}));
