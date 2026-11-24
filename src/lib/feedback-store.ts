import { create } from "zustand";

export type FeedbackNotice = { text: string; tone: "success" | "error" };

type FeedbackState = {
  // 正在补充原因的消息；null 表示没有打开弹窗
  target: { messageId: number } | null;
  // 轻量提示：反馈提交成功或失败
  notice: FeedbackNotice | null;
  open: (messageId: number) => void;
  close: () => void;
  notify: (text: string, tone: FeedbackNotice["tone"]) => void;
  clearNotice: () => void;
};

export const useFeedbackStore = create<FeedbackState>()((set) => ({
  target: null,
  notice: null,
  open: (messageId) => set({ target: { messageId } }),
  close: () => set({ target: null }),
  notify: (text, tone) => set({ notice: { text, tone } }),
  clearNotice: () => set({ notice: null }),
}));
