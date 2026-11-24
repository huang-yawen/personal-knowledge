import { Router } from "express";
import type { RowDataPacket } from "mysql2";
import { pool } from "../../db";
import { currentUserId } from "../auth/context";
import { parseId } from "../knowledge-base/routes";
import { parseFeedbackInput } from "./validation";

export const feedbackRouter = Router();

// 只能给自己的助手消息反馈；重复提交按唯一键更新，先点踩再补原因不用新增一条
feedbackRouter.post("/messages/:id/feedback", async (req, res) => {
  const messageId = parseId(req.params.id);
  const input = parseFeedbackInput(req.body);
  if (!messageId) {
    res.status(404).json({ error: "消息不存在" });
    return;
  }
  if (typeof input === "string") {
    res.status(400).json({ error: input });
    return;
  }

  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT id FROM messages WHERE id = ? AND user_id = ? AND role = 'assistant'",
    [messageId, currentUserId()],
  );
  if (!rows[0]) {
    res.status(404).json({ error: "消息不存在" });
    return;
  }

  await pool.query(
    `INSERT INTO message_feedback (user_id, message_id, rating, reason, comment)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE rating = VALUES(rating), reason = VALUES(reason), comment = VALUES(comment)`,
    [currentUserId(), messageId, input.rating, input.reason ?? null, input.comment ?? null],
  );
  res.status(204).end();
});
