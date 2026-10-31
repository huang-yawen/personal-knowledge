import { Router } from "express";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { config } from "../../config";
import { pool } from "../../db";
import { parseId } from "../knowledge-base/routes";

const conversationColumns = `id, title, knowledge_base_id AS knowledgeBaseId, created_at AS createdAt, updated_at AS updatedAt`;

export const conversationRouter = Router();

conversationRouter.get("/", async (_req, res) => {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT ${conversationColumns} FROM conversations WHERE user_id = ? ORDER BY updated_at DESC, id DESC LIMIT 100`,
    [config.devUserId],
  );
  res.json(rows);
});

conversationRouter.get("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  const [conversations] = id
    ? await pool.query<RowDataPacket[]>(`SELECT ${conversationColumns} FROM conversations WHERE id = ? AND user_id = ?`, [
        id,
        config.devUserId,
      ])
    : [[]];
  if (!id || conversations.length === 0) {
    res.status(404).json({ error: "对话不存在" });
    return;
  }
  const [messages] = await pool.query<RowDataPacket[]>(
    "SELECT id, role, content, citations FROM messages WHERE conversation_id = ? ORDER BY id",
    [id],
  );
  res.json({ ...conversations[0], messages });
});

conversationRouter.delete("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  const [result] = id
    ? await pool.query<ResultSetHeader>("DELETE FROM conversations WHERE id = ? AND user_id = ?", [id, config.devUserId])
    : [undefined];
  if (!result || result.affectedRows === 0) {
    res.status(404).json({ error: "对话不存在" });
    return;
  }
  res.status(204).end();
});
