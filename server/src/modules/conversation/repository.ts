import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { config } from "../../config";
import { pool } from "../../db";

export type ChatMessage = { role: "user" | "assistant"; content: string };

// 标题取第一句话的前 30 个字符
export const makeTitle = (text: string) => {
  const firstLine = text.trim().split("\n")[0];
  const chars = Array.from(firstLine);
  return chars.length > 30 ? `${chars.slice(0, 30).join("")}…` : firstLine || "新对话";
};

export const conversationExists = async (id: number) => {
  const [rows] = await pool.query<RowDataPacket[]>("SELECT id FROM conversations WHERE id = ? AND user_id = ?", [
    id,
    config.devUserId,
  ]);
  return rows.length > 0;
};

export const createConversation = async (title: string, knowledgeBaseId: number | undefined) => {
  const [result] = await pool.query<ResultSetHeader>(
    "INSERT INTO conversations (user_id, title, knowledge_base_id) VALUES (?, ?, ?)",
    [config.devUserId, title, knowledgeBaseId ?? null],
  );
  return result.insertId;
};

// 更新提问范围并刷新更新时间（值没变时 ON UPDATE 不会触发，所以显式写）
export const touchConversation = (id: number, knowledgeBaseId: number | undefined) =>
  pool.query("UPDATE conversations SET knowledge_base_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?", [
    knowledgeBaseId ?? null,
    id,
    config.devUserId,
  ]);

// 让库里的历史与界面一致：保留与界面历史相同的前缀，其后的旧消息删除，界面多出的新消息写入。
// 这样“重新生成”“编辑后重发”都不会留下重复或过期的消息
export const syncMessages = async (conversationId: number, incoming: ChatMessage[]) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [stored] = await conn.query<RowDataPacket[]>(
      "SELECT id, role, content FROM messages WHERE conversation_id = ? ORDER BY id",
      [conversationId],
    );
    let common = 0;
    while (
      common < stored.length &&
      common < incoming.length &&
      stored[common].role === incoming[common].role &&
      stored[common].content === incoming[common].content
    ) {
      common++;
    }
    if (common < stored.length) {
      await conn.query("DELETE FROM messages WHERE conversation_id = ? AND id >= ?", [conversationId, stored[common].id]);
    }
    if (common < incoming.length) {
      await conn.query("INSERT INTO messages (user_id, conversation_id, role, content) VALUES ?", [
        incoming.slice(common).map((message) => [config.devUserId, conversationId, message.role, message.content]),
      ]);
    }
    await conn.commit();
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
};

export const saveAssistantMessage = async (conversationId: number, content: string, citations: object[]) => {
  await pool.query(
    "INSERT INTO messages (user_id, conversation_id, role, content, citations) VALUES (?, ?, 'assistant', ?, ?)",
    [config.devUserId, conversationId, content, JSON.stringify(citations)],
  );
  await pool.query("UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = ?", [conversationId]);
};
