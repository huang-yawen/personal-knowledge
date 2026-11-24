import { useRef, useState } from "react";
import { submitMessageFeedback, type MessageFeedbackReason } from "@/lib/api";
import { useFeedbackStore } from "@/lib/feedback-store";
import { useFocusTrap } from "@/hooks/use-focus-trap";
import { useEscapeKey } from "@/hooks/use-escape-key";
import { errorMessage } from "@/lib/utils";

// 点踩原因：只让用户选最主要的一个，避免一次点踩变成填表
const REASONS: { code: MessageFeedbackReason; label: string }[] = [
  { code: "off_topic", label: "答非所问" },
  { code: "outdated", label: "资料过时" },
  { code: "not_found", label: "找不到信息" },
  { code: "wrong_citation", label: "引用错误" },
  { code: "incomplete", label: "内容不完整" },
  { code: "other", label: "其他" },
];

/**
 * 点踩后补充原因。
 *
 * 点踩本身已经由反馈适配器先落库了，这个弹窗只是把原因补到同一条记录上；
 * 用户直接关闭也不会丢掉「这条回答没帮助」这个信号。
 */
export function FeedbackDialog() {
  const target = useFeedbackStore((state) => state.target);
  if (!target) return null;
  // 用 messageId 做 key：换一条消息时整个弹窗重新挂载，状态天然重置
  return <FeedbackDialogBody key={target.messageId} messageId={target.messageId} />;
}

function FeedbackDialogBody({ messageId }: { messageId: number }) {
  const close = useFeedbackStore((state) => state.close);
  const notify = useFeedbackStore((state) => state.notify);
  const [reason, setReason] = useState<MessageFeedbackReason | null>(null);
  const [comment, setComment] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const panelRef = useRef<HTMLElement>(null);
  useFocusTrap(panelRef, true);
  useEscapeKey(true, close);

  const save = async () => {
    setBusy(true);
    setError("");
    try {
      await submitMessageFeedback(messageId, {
        rating: "negative",
        ...(reason ? { reason } : {}),
        ...(comment.trim() ? { comment: comment.trim() } : {}),
      });
      close();
      notify("反馈已记录，谢谢", "success");
    } catch (failure) {
      setError(errorMessage(failure));
      setBusy(false);
    }
  };

  return (
    <div className="feedback-layer" role="presentation">
      <button className="modal-backdrop" type="button" aria-label="关闭反馈" onClick={close} />
      <section
        className="feedback-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="feedback-title"
        ref={panelRef}
      >
        <h3 id="feedback-title">这条回答哪里不好？</h3>
        <p>选一个最主要的原因，也可以补充说明。已经记为「没帮助」，补充后会覆盖上一次的记录。</p>
        <div className="feedback-reasons" role="group" aria-label="反馈原因">
          {REASONS.map(({ code, label }) => (
            <button
              key={code}
              type="button"
              aria-pressed={reason === code}
              className={reason === code ? "selected" : ""}
              onClick={() => setReason(reason === code ? null : code)}
            >
              {label}
            </button>
          ))}
        </div>
        <textarea
          value={comment}
          maxLength={500}
          aria-label="补充说明（可选）"
          placeholder="补充说明（可选）"
          onChange={(event) => setComment(event.target.value)}
        />
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="feedback-actions">
          <button type="button" onClick={close} disabled={busy}>取消</button>
          <button type="button" className="modal-primary" onClick={() => void save()} disabled={busy}>
            {busy ? "提交中…" : "提交"}
          </button>
        </div>
      </section>
    </div>
  );
}
