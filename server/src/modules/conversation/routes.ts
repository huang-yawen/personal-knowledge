import { Router } from "express";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { config } from "../../config";
import { pool } from "../../db";
import { parseId } from "../knowledge-base/routes";

// knowledgeBaseIds 为空数组表示“全部知识库”
const conversationColumns = `c.id, c.title, c.is_favorite AS isFavorite, c.archived_at IS NOT NULL AS archived,
  c.created_at AS createdAt, c.updated_at AS updatedAt,
  (SELECT JSON_ARRAYAGG(knowledge_base_id) FROM conversation_knowledge_bases WHERE conversation_id = c.id) AS knowledgeBaseIds`;

const toDto = (row: RowDataPacket) => ({
  ...row,
  isFavorite: Boolean(row.isFavorite),
  archived: Boolean(row.archived),
  knowledgeBaseIds: (row.knowledgeBaseIds ?? []) as number[],
});

const fetchConversation = async (id: number) => {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT ${conversationColumns} FROM conversations c WHERE c.id = ? AND c.user_id = ?`,
    [id, config.devUserId],
  );
  return rows[0] ? toDto(rows[0]) : undefined;
};

export const conversationRouter = Router();

// q 同时匹配标题和消息内容；archived=1 只看已归档，默认只看未归档
conversationRouter.get("/", async (req, res) => {
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const conditions = ["c.user_id = ?", req.query.archived === "1" ? "c.archived_at IS NOT NULL" : "c.archived_at IS NULL"];
  const params: (number | string)[] = [config.devUserId];
  if (q) {
    // 转义 LIKE 通配符，让用户输入的 % 和 _ 按字面匹配
    const like = `%${q.replace(/[\\%_]/g, "\\$&")}%`;
    conditions.push("(c.title LIKE ? OR EXISTS (SELECT 1 FROM messages m WHERE m.conversation_id = c.id AND m.content LIKE ?))");
    params.push(like, like);
  }
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT ${conversationColumns} FROM conversations c WHERE ${conditions.join(" AND ")}
     ORDER BY c.updated_at DESC, c.id DESC LIMIT 100`,
    params,
  );
  res.json(rows.map(toDto));
});

conversationRouter.get("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  const conversation = id ? await fetchConversation(id) : undefined;
  if (!id || !conversation) {
    res.status(404).json({ error: "对话不存在" });
    return;
  }
  const [messages] = await pool.query<RowDataPacket[]>(
    "SELECT id, role, content, citations FROM messages WHERE conversation_id = ? ORDER BY id",
    [id],
  );
  res.json({ ...conversation, messages });
});

// 重命名、收藏、归档。显式写 updated_at = updated_at，避免这些操作把对话顶到列表最前
conversationRouter.patch("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  const body = (typeof req.body === "object" && req.body !== null ? req.body : {}) as Record<string, unknown>;
  const sets: string[] = ["updated_at = updated_at"];
  const params: (number | string)[] = [];
  if (body.title !== undefined) {
    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (!title || Array.from(title).length > 100) {
      res.status(400).json({ error: "标题不能为空，且不超过 100 个字符" });
      return;
    }
    sets.push("title = ?");
    params.push(title);
  }
  if (body.isFavorite !== undefined) {
    if (typeof body.isFavorite !== "boolean") {
      res.status(400).json({ error: "收藏状态格式不正确" });
      return;
    }
    sets.push("is_favorite = ?");
    params.push(body.isFavorite ? 1 : 0);
  }
  if (body.archived !== undefined) {
    if (typeof body.archived !== "boolean") {
      res.status(400).json({ error: "归档状态格式不正确" });
      return;
    }
    sets.push(body.archived ? "archived_at = COALESCE(archived_at, CURRENT_TIMESTAMP)" : "archived_at = NULL");
  }
  if (sets.length === 1) {
    res.status(400).json({ error: "没有需要修改的内容" });
    return;
  }
  const [result] = id
    ? await pool.query<ResultSetHeader>(`UPDATE conversations SET ${sets.join(", ")} WHERE id = ? AND user_id = ?`, [
        ...params,
        id,
        config.devUserId,
      ])
    : [undefined];
  if (!id || !result || result.affectedRows === 0) {
    res.status(404).json({ error: "对话不存在" });
    return;
  }
  res.json(await fetchConversation(id));
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
