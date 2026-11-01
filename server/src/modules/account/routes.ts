import { rm } from "node:fs/promises";
import path from "node:path";
import { Router } from "express";
import type { RowDataPacket } from "mysql2";
import { config } from "../../config";
import { pool } from "../../db";
import { clearSessionCookie } from "../auth/session";
import { currentUserId } from "../auth/context";
import { MAX_PASSWORD_CHARS, verifyPassword } from "../auth/password";
import { clearFailures, isBlocked, recordFailure } from "../auth/rate-limit";
import { deleteVectors } from "../rag/qdrant";
import { getSettings } from "../settings/repository";

export const accountRouter = Router();

// 按 key 把子记录分组，用于把分块、标签等挂到所属记录下
const groupBy = <T extends RowDataPacket>(rows: T[], key: string) => {
  const groups = new Map<number, T[]>();
  for (const row of rows) groups.set(row[key] as number, [...(groups.get(row[key] as number) ?? []), row]);
  return groups;
};

// 导出个人数据（JSON）：账号信息、设置、知识库与文档元数据及分块文本、对话、笔记、轨迹。
// 不含密码哈希、会话和上传的原始文件
accountRouter.get("/export", async (_req, res) => {
  const userId = currentUserId();
  const rows = async (sql: string) => (await pool.query<RowDataPacket[]>(sql, [userId]))[0];
  const [user, knowledgeBases, documents, chunks, conversations, conversationKbs, messages, notes, tags, sources, activities] =
    await Promise.all([
      rows("SELECT username, display_name AS displayName, is_admin AS isAdmin, created_at AS createdAt FROM users WHERE id = ?"),
      rows("SELECT id, name, description, created_at AS createdAt FROM knowledge_bases WHERE user_id = ? ORDER BY id"),
      rows(
        `SELECT id, knowledge_base_id AS knowledgeBaseId, original_name AS name, size_bytes AS sizeBytes, status,
           source_note_id AS sourceNoteId, created_at AS createdAt FROM documents WHERE user_id = ? ORDER BY id`,
      ),
      rows("SELECT document_id AS documentId, chunk_index AS chunkIndex, page_number AS page, content FROM document_chunks WHERE user_id = ? ORDER BY document_id, chunk_index"),
      rows("SELECT id, title, is_favorite AS isFavorite, archived_at AS archivedAt, created_at AS createdAt FROM conversations WHERE user_id = ? ORDER BY id"),
      rows("SELECT c.conversation_id AS conversationId, c.knowledge_base_id AS knowledgeBaseId FROM conversation_knowledge_bases c JOIN conversations v ON v.id = c.conversation_id WHERE v.user_id = ?"),
      rows("SELECT conversation_id AS conversationId, role, content, citations, created_at AS createdAt FROM messages WHERE user_id = ? ORDER BY id"),
      rows("SELECT id, title, content, category, created_at AS createdAt, updated_at AS updatedAt FROM notes WHERE user_id = ? ORDER BY id"),
      rows("SELECT t.note_id AS noteId, t.tag FROM note_tags t JOIN notes n ON n.id = t.note_id WHERE n.user_id = ?"),
      rows("SELECT s.note_id AS noteId, s.type, s.ref_id AS refId, s.label FROM note_sources s JOIN notes n ON n.id = s.note_id WHERE n.user_id = ? ORDER BY s.id"),
      rows("SELECT type, title, created_at AS createdAt FROM activities WHERE user_id = ? ORDER BY id"),
    ]);

  const chunksByDoc = groupBy(chunks, "documentId");
  const kbsByConversation = groupBy(conversationKbs, "conversationId");
  const messagesByConversation = groupBy(messages, "conversationId");
  const tagsByNote = groupBy(tags, "noteId");
  const sourcesByNote = groupBy(sources, "noteId");

  const data = {
    exportedAt: new Date().toISOString(),
    account: user[0],
    settings: await getSettings(),
    knowledgeBases,
    documents: documents.map((doc) => ({
      ...doc,
      chunks: (chunksByDoc.get(doc.id as number) ?? []).map(({ chunkIndex, page, content }) => ({ chunkIndex, page, content })),
    })),
    conversations: conversations.map((conv) => ({
      ...conv,
      knowledgeBaseIds: (kbsByConversation.get(conv.id as number) ?? []).map((item) => item.knowledgeBaseId),
      messages: (messagesByConversation.get(conv.id as number) ?? []).map(({ role, content, citations, createdAt }) => ({ role, content, citations, createdAt })),
    })),
    notes: notes.map((note) => ({
      ...note,
      tags: (tagsByNote.get(note.id as number) ?? []).map((item) => item.tag),
      sources: (sourcesByNote.get(note.id as number) ?? []).map(({ type, refId, label }) => ({ type, refId, label })),
    })),
    activities,
  };
  const date = new Date().toISOString().slice(0, 10);
  res.attachment(`personal-knowledge-export-${date}.json`).type("json").send(JSON.stringify(data, null, 2));
});

// 永久删除账号及全部数据：向量、数据库记录、上传的文件。需要输入密码确认
accountRouter.delete("/", async (req, res) => {
  const userId = currentUserId();
  const password = typeof req.body?.password === "string" ? (req.body.password as string) : "";
  const guardKey = `delete|${userId}`;
  if (isBlocked(guardKey)) {
    res.status(429).json({ error: "失败次数过多，请 15 分钟后再试" });
    return;
  }
  const [rows] = await pool.query<RowDataPacket[]>("SELECT password_hash, is_admin FROM users WHERE id = ?", [userId]);
  if (!rows[0] || password.length > MAX_PASSWORD_CHARS || !(await verifyPassword(password, rows[0].password_hash as string))) {
    recordFailure(guardKey);
    res.status(403).json({ error: "密码不正确" });
    return;
  }
  clearFailures(guardKey);
  // 至少保留一个管理员，否则没人能生成邀请码
  if (rows[0].is_admin) {
    const [others] = await pool.query<RowDataPacket[]>("SELECT COUNT(*) AS n FROM users WHERE is_admin = 1 AND id <> ?", [userId]);
    if (Number(others[0].n) === 0) {
      res.status(409).json({ error: "你是唯一的管理员，不能删除账号" });
      return;
    }
  }

  // 先删向量：向量库不可用时直接中止，不会留下数据库已删但向量残留的状态
  try {
    await deleteVectors("user_id", userId);
  } catch (error) {
    console.error("删除账号时清理向量失败", error);
    res.status(502).json({ error: "向量库暂时不可用，账号未删除，请稍后重试" });
    return;
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    // 文档、分块、消息、标签、来源等由外键级联删除；sessions、usage_logs、user_settings 随用户级联
    for (const table of ["knowledge_bases", "conversations", "notes", "activities"]) {
      await conn.query(`DELETE FROM ${table} WHERE user_id = ?`, [userId]);
    }
    await conn.query("DELETE FROM users WHERE id = ?", [userId]);
    await conn.commit();
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
  await rm(path.join(config.uploadDir, String(userId)), { recursive: true, force: true }).catch((error: unknown) =>
    console.error("删除账号时清理上传文件失败", error),
  );
  clearSessionCookie(res);
  res.status(204).end();
});
