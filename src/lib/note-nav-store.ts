import { create } from "zustand";

type NoteNavState = {
  // 从别处（阅读抽屉、对话菜单）请求在笔记页打开的笔记；笔记页读取后清空
  pendingNoteId: number | null;
  request: (id: number) => void;
  consume: () => void;
};

export const useNoteNavStore = create<NoteNavState>()((set) => ({
  pendingNoteId: null,
  request: (pendingNoteId) => set({ pendingNoteId }),
  consume: () => set({ pendingNoteId: null }),
}));
