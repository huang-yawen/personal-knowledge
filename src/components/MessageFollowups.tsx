import { ThreadPrimitive, useAuiState } from "@assistant-ui/react";

// 回答下方的追问建议：仅最新一条回答、且回答结束后显示；点击即作为新问题发送
export function MessageFollowups() {
  const followups = useAuiState((s) => s.message.metadata.custom?.followups) as string[] | undefined;
  const visible = useAuiState((s) => s.message.isLast && !s.thread.isRunning);
  if (!visible || !followups || followups.length === 0) return null;

  return (
    <div className="message-followups">
      {followups.map((text) => (
        <ThreadPrimitive.Suggestion className="followup-chip" key={text} prompt={text} send>
          {text}
        </ThreadPrimitive.Suggestion>
      ))}
    </div>
  );
}
