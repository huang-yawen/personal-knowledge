import { Router } from "express";
import type { RowDataPacket } from "mysql2";
import { config } from "../../config";
import { pool } from "../../db";

export const activityRouter = Router();

// 轨迹：按 id 倒序，before 为上一页最后一条的 id，用于加载更多
activityRouter.get("/activities", async (req, res) => {
  const before = Number(req.query.before);
  const limit = Math.min(Math.max(Number(req.query.limit) || 30, 1), 100);
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT id, type, title, ref_id AS refId, created_at AS createdAt
     FROM activities WHERE user_id = ? ${Number.isInteger(before) && before > 0 ? "AND id < ?" : ""}
     ORDER BY id DESC LIMIT ?`,
    Number.isInteger(before) && before > 0 ? [config.devUserId, before, limit] : [config.devUserId, limit],
  );
  res.json(rows);
});

// 工作台总览：各类数量，以及需要处理（失败或仍在处理中）的文档
activityRouter.get("/overview", async (_req, res) => {
  const userId = config.devUserId;
  const [counts] = await pool.query<RowDataPacket[]>(
    `SELECT (SELECT COUNT(*) FROM knowledge_bases WHERE user_id = ?) AS knowledgeBases,
            (SELECT COUNT(*) FROM documents WHERE user_id = ?) AS documents,
            (SELECT COUNT(*) FROM conversations WHERE user_id = ?) AS conversations`,
    [userId, userId, userId],
  );
  const [attention] = await pool.query<RowDataPacket[]>(
    `SELECT id, original_name AS name, knowledge_base_id AS knowledgeBaseId, status, error_message AS errorMessage
     FROM documents WHERE user_id = ? AND status <> 'done' ORDER BY updated_at DESC, id DESC LIMIT 10`,
    [userId],
  );
  res.json({
    knowledgeBases: Number(counts[0].knowledgeBases),
    documents: Number(counts[0].documents),
    conversations: Number(counts[0].conversations),
    attention,
  });
});
