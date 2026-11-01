import { pool } from "../../db";

export type ActivityType = "kb_created" | "doc_uploaded" | "doc_ready" | "doc_failed" | "conversation_started" | "note_created";

// 记录一条动态。轨迹只是辅助信息，写入失败只打日志，不能影响上传、问答等主流程，所以这里不会抛出异常
export const recordActivity = (userId: number, type: ActivityType, title: string, refId: number) =>
  pool
    .query("INSERT INTO activities (user_id, type, title, ref_id) VALUES (?, ?, ?, ?)", [
      userId,
      type,
      Array.from(title).slice(0, 255).join(""),
      refId,
    ])
    .then(
      () => undefined,
      (error: unknown) => console.error("记录动态失败", error),
    );
