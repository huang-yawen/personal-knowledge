import { Router } from "express";
import type { RowDataPacket } from "mysql2";
import { config } from "../../config";
import { pool } from "../../db";
import { currentUserId } from "../auth/context";
import { todayTokens } from "./index";

export const statsRouter = Router();

const MONTH_START = "DATE_FORMAT(CURDATE(), '%Y-%m-01')";

// 个人中心的使用统计
statsRouter.get("/", async (_req, res) => {
  const userId = currentUserId();
  const one = async (sql: string) => {
    const [rows] = await pool.query<RowDataPacket[]>(sql, [userId]);
    return Number(rows[0].n);
  };
  const [conversations, conversationsMonth, knowledgeBases, documents, documentsDone, documentsFailed, chunks, notes, notesMonth, tokensMonth, tokensTotal, tokensToday] =
    await Promise.all([
      one("SELECT COUNT(*) AS n FROM conversations WHERE user_id = ?"),
      one(`SELECT COUNT(*) AS n FROM conversations WHERE user_id = ? AND created_at >= ${MONTH_START}`),
      one("SELECT COUNT(*) AS n FROM knowledge_bases WHERE user_id = ?"),
      one("SELECT COUNT(*) AS n FROM documents WHERE user_id = ?"),
      one("SELECT COUNT(*) AS n FROM documents WHERE user_id = ? AND status = 'done'"),
      one("SELECT COUNT(*) AS n FROM documents WHERE user_id = ? AND status = 'failed'"),
      one("SELECT COUNT(*) AS n FROM document_chunks WHERE user_id = ?"),
      one("SELECT COUNT(*) AS n FROM notes WHERE user_id = ?"),
      one(`SELECT COUNT(*) AS n FROM notes WHERE user_id = ? AND created_at >= ${MONTH_START}`),
      one(`SELECT COALESCE(SUM(tokens), 0) AS n FROM usage_logs WHERE user_id = ? AND created_at >= ${MONTH_START}`),
      one("SELECT COALESCE(SUM(tokens), 0) AS n FROM usage_logs WHERE user_id = ?"),
      todayTokens(userId),
    ]);
  res.json({
    conversations,
    conversationsMonth,
    knowledgeBases,
    documents,
    documentsDone,
    documentsFailed,
    chunks,
    notes,
    notesMonth,
    tokens: { today: tokensToday, month: tokensMonth, total: tokensTotal, dailyLimit: config.limits.dailyTokens },
  });
});
