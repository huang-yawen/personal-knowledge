import { useEffect } from "react";
import { useFeedbackStore } from "@/lib/feedback-store";

// 反馈提交结果的轻量提示：成功也提示一下，失败必须让用户知道
export function FeedbackNotice() {
  const notice = useFeedbackStore((state) => state.notice);
  const clear = useFeedbackStore((state) => state.clearNotice);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(clear, 3500);
    return () => window.clearTimeout(timer);
  }, [notice, clear]);

  if (!notice) return null;
  return (
    <div className={`feedback-notice ${notice.tone}`} role={notice.tone === "error" ? "alert" : "status"}>
      {notice.text}
    </div>
  );
}
