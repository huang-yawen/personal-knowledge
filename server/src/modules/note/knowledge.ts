import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { config } from "../../config";
import { pool } from "../../db";
import { removeDocument } from "../document/remove";
import { enqueue } from "../worker/queue";
import { currentUserId } from "../auth/context";

// 带 HTTP 状态码的业务错误，路由层直接转成响应
export class NoteKnowledgeError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const noteHash = (title: string, content: string) => createHash("sha256").update(`${title}\n${content}`).digest("hex");

// 笔记当前所在的知识库及处理状态；outdated 表示笔记在同步之后又被修改过
export const getNoteKnowledgeBase = async (note: { id: number; title: string; content: string }) => {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT d.id AS documentId, d.knowledge_base_id AS knowledgeBaseId, kb.name AS knowledgeBaseName,
            d.status, d.error_message AS errorMessage, d.source_note_hash AS hash
     FROM documents d JOIN knowledge_bases kb ON kb.id = d.knowledge_base_id
     WHERE d.source_note_id = ? AND d.user_id = ? LIMIT 1`,
    [note.id, currentUserId()],
  );
  if (!rows[0]) return null;
  const { hash, ...rest } = rows[0];
  return { ...rest, outdated: hash !== noteHash(note.title, note.content) };
};

// 加入或更新：把笔记写成 .md 文件并生成一份文档，交给现有队列切块、向量化。
// 已在同一知识库则覆盖原文档；在别的知识库则先移除再加入新的
export const addNoteToKnowledgeBase = async (noteId: number, knowledgeBaseId: number) => {
  const [notes] = await pool.query<RowDataPacket[]>("SELECT title, content FROM notes WHERE id = ? AND user_id = ?", [
    noteId,
    currentUserId(),
  ]);
  if (!notes[0]) throw new NoteKnowledgeError(404, "笔记不存在");
  const title = notes[0].title as string;
  const content = notes[0].content as string;
  if (!content.trim()) throw new NoteKnowledgeError(400, "笔记还没有内容，无法加入知识库");

  const [kbs] = await pool.query<RowDataPacket[]>("SELECT id FROM knowledge_bases WHERE id = ? AND user_id = ?", [
    knowledgeBaseId,
    currentUserId(),
  ]);
  if (kbs.length === 0) throw new NoteKnowledgeError(404, "知识库不存在");

  // 标题放在正文最前面，检索时标题也能参与匹配
  const body = `# ${title}\n\n${content}\n`;
  const [existing] = await pool.query<RowDataPacket[]>(
    "SELECT id, knowledge_base_id, stored_path FROM documents WHERE source_note_id = ? AND user_id = ?",
    [noteId, currentUserId()],
  );
  const old = existing[0];

  if (old && old.knowledge_base_id === knowledgeBaseId) {
    await writeFile(path.join(config.uploadDir, old.stored_path as string), body);
    await pool.query(
      `UPDATE documents SET original_name = ?, size_bytes = ?, source_note_hash = ?, status = 'pending', error_message = NULL
       WHERE id = ?`,
      [title, Buffer.byteLength(body), noteHash(title, content), old.id],
    );
    enqueue(old.id as number);
    return;
  }

  if (old) await removeDocument(old.id as number);
  const [count] = await pool.query<RowDataPacket[]>("SELECT COUNT(*) AS total FROM documents WHERE knowledge_base_id = ?", [
    knowledgeBaseId,
  ]);
  if (Number(count[0].total) >= config.maxDocsPerKnowledgeBase) {
    throw new NoteKnowledgeError(409, `每个知识库最多 ${config.maxDocsPerKnowledgeBase} 个文件`);
  }

  const dir = path.join(config.uploadDir, String(currentUserId()), String(knowledgeBaseId));
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, `${randomUUID()}.md`);
  await writeFile(file, body);
  const [result] = await pool.query<ResultSetHeader>(
    `INSERT INTO documents (user_id, knowledge_base_id, original_name, stored_path, mime_type, size_bytes, source_note_id, source_note_hash)
     VALUES (?, ?, ?, ?, 'text/markdown', ?, ?, ?)`,
    [
      currentUserId(),
      knowledgeBaseId,
      title,
      path.relative(config.uploadDir, file),
      Buffer.byteLength(body),
      noteId,
      noteHash(title, content),
    ],
  );
  enqueue(result.insertId);
};

// 移出知识库：删除对应的文档、文件和向量，笔记本身不变
export const removeNoteFromKnowledgeBase = async (noteId: number) => {
  const [rows] = await pool.query<RowDataPacket[]>("SELECT id FROM documents WHERE source_note_id = ? AND user_id = ?", [
    noteId,
    currentUserId(),
  ]);
  if (rows[0]) await removeDocument(rows[0].id as number);
};
