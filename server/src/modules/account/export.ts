import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { once } from "node:events";
import { finished } from "node:stream/promises";
import type { RowDataPacket } from "mysql2";
import { config } from "../../config";
import { pool } from "../../db";
import { getSettings } from "../settings/repository";

// 分页大小：决定导出时占用的内存上限（一页约 500 条分块）
const CHUNK_PAGE = 500;
const MESSAGE_PAGE = 500;

type Write = (text: string) => Promise<void>;

// 每次只取一页，按键集分页（有序索引，OFFSET 在页数不多时可以接受）
const query = async (sql: string, params: unknown[]) => (await pool.query<RowDataPacket[]>(sql, params))[0];

// 把数组的每个元素依次写出，避免先拼成一个巨大的数组
const writeArray = async <T>(write: Write, items: T[], writeItem: (item: T) => Promise<void>) => {
  await write("[");
  for (let index = 0; index < items.length; index++) {
    if (index > 0) await write(",");
    await writeItem(items[index]);
  }
  await write("]");
};

// 一个对象里混着一个流式数组时的写法：先写对象的其它字段，再接上数组，最后补右括号
const writeObjectHead = async (write: Write, fields: Record<string, unknown>) => {
  const json = JSON.stringify(fields);
  await write(json.slice(0, -1)); // 去掉结尾的 }，后面继续加字段
};

// 文档：元数据 + 分块正文（正文是导出的主要体积来源，必须分页流式写）
const writeDocument = async (write: Write, userId: number, doc: RowDataPacket) => {
  await writeObjectHead(write, doc);
  await write(',"chunks":[');
  let offset = 0;
  let first = true;
  for (;;) {
    const page = await query(
      `SELECT chunk_index AS chunkIndex, page_number AS page, content
       FROM document_chunks WHERE document_id = ? AND user_id = ?
       ORDER BY chunk_index LIMIT ? OFFSET ?`,
      [doc.id, userId, CHUNK_PAGE, offset],
    );
    for (const row of page) {
      await write(`${first ? "" : ","}${JSON.stringify(row)}`);
      first = false;
    }
    if (page.length < CHUNK_PAGE) break;
    offset += CHUNK_PAGE;
  }
  await write("]}");
};

// 对话：元数据 + 检索范围 + 消息
const writeConversation = async (
  write: Write,
  userId: number,
  conversation: RowDataPacket,
  knowledgeBaseIds: number[],
) => {
  await writeObjectHead(write, conversation);
  await write(`,"knowledgeBaseIds":${JSON.stringify(knowledgeBaseIds)},"messages":[`);
  let offset = 0;
  let first = true;
  for (;;) {
    const page = await query(
      `SELECT role, content, citations, created_at AS createdAt
       FROM messages WHERE conversation_id = ? AND user_id = ?
       ORDER BY id LIMIT ? OFFSET ?`,
      [conversation.id, userId, MESSAGE_PAGE, offset],
    );
    for (const row of page) {
      await write(`${first ? "" : ","}${JSON.stringify(row)}`);
      first = false;
    }
    if (page.length < MESSAGE_PAGE) break;
    offset += MESSAGE_PAGE;
  }
  await write("]}");
};

// 笔记：元数据 + 标签 + 来源
const writeNote = async (write: Write, note: RowDataPacket, tags: string[], sources: unknown[]) => {
  await writeObjectHead(write, note);
  await write(`,"tags":${JSON.stringify(tags)},"sources":${JSON.stringify(sources)}}`);
};

/**
 * 把某个用户的全部数据写成 JSON 文件。
 *
 * 全程只保留一页查询结果，内存占用与账号数据量无关；写完之后调用方再把这个文件流式发出去。
 * 中途失败会留下半个文件，所以由调用方负责删除（配合「写完才发送」，客户端永远不会拿到半个 JSON）。
 */
export const writeExportFile = async (userId: number, filePath: string) => {
  await mkdir(config.tempDir, { recursive: true });
  const stream = createWriteStream(filePath, { encoding: "utf8" });
  // 背压：写不进去就等一下，避免把数据堆在内存里
  const write: Write = async (text) => {
    if (!stream.write(text)) await once(stream, "drain");
  };

  try {
    const settings = await getSettings();

    const account = await query("SELECT username, display_name AS displayName, is_admin AS isAdmin, created_at AS createdAt FROM users WHERE id = ?", [userId]);
    const knowledgeBases = await query("SELECT id, name, description, created_at AS createdAt FROM knowledge_bases WHERE user_id = ? ORDER BY id", [userId]);
    const documents = await query(
      `SELECT id, knowledge_base_id AS knowledgeBaseId, original_name AS name, size_bytes AS sizeBytes, status,
         source_note_id AS sourceNoteId, created_at AS createdAt FROM documents WHERE user_id = ? ORDER BY id`,
      [userId],
    );
    const conversations = await query(
      `SELECT id, title, is_favorite AS isFavorite, archived_at AS archivedAt, created_at AS createdAt
       FROM conversations WHERE user_id = ? ORDER BY id`,
      [userId],
    );
    const conversationKbs = await query(
      `SELECT c.conversation_id AS conversationId, c.knowledge_base_id AS knowledgeBaseId
       FROM conversation_knowledge_bases c JOIN conversations v ON v.id = c.conversation_id WHERE v.user_id = ?`,
      [userId],
    );
    const notes = await query(
      "SELECT id, title, content, category, created_at AS createdAt, updated_at AS updatedAt FROM notes WHERE user_id = ? ORDER BY id",
      [userId],
    );
    const noteTags = await query("SELECT t.note_id AS noteId, t.tag FROM note_tags t JOIN notes n ON n.id = t.note_id WHERE n.user_id = ?", [userId]);
    const noteSources = await query(
      "SELECT s.note_id AS noteId, s.type, s.ref_id AS refId, s.label FROM note_sources s JOIN notes n ON n.id = s.note_id WHERE n.user_id = ? ORDER BY s.id",
      [userId],
    );
    const activities = await query("SELECT type, title, created_at AS createdAt FROM activities WHERE user_id = ? ORDER BY id", [userId]);

    // 小表在内存里按父记录分组；大表（chunks / messages）不预先查出来
    const kbsByConversation = new Map<number, number[]>();
    for (const row of conversationKbs) {
      const list = kbsByConversation.get(row.conversationId as number) ?? [];
      list.push(row.knowledgeBaseId as number);
      kbsByConversation.set(row.conversationId as number, list);
    }
    const tagsByNote = new Map<number, string[]>();
    for (const row of noteTags) {
      const list = tagsByNote.get(row.noteId as number) ?? [];
      list.push(row.tag as string);
      tagsByNote.set(row.noteId as number, list);
    }
    const sourcesByNote = new Map<number, unknown[]>();
    for (const row of noteSources) {
      const list = sourcesByNote.get(row.noteId as number) ?? [];
      list.push({ type: row.type, refId: row.refId, label: row.label });
      sourcesByNote.set(row.noteId as number, list);
    }

    await write(`{"exportedAt":${JSON.stringify(new Date().toISOString())}`);
    await write(`,"account":${JSON.stringify(account[0] ?? null)}`);
    await write(`,"settings":${JSON.stringify(settings)}`);
    await write(`,"knowledgeBases":${JSON.stringify(knowledgeBases)}`);

    await write(`,"documents":`);
    await writeArray(write, documents, (doc) => writeDocument(write, userId, doc));

    await write(`,"conversations":`);
    await writeArray(write, conversations, (conversation) =>
      writeConversation(write, userId, conversation, kbsByConversation.get(conversation.id as number) ?? []),
    );

    await write(`,"notes":`);
    await writeArray(write, notes, (note) =>
      writeNote(write, note, tagsByNote.get(note.id as number) ?? [], sourcesByNote.get(note.id as number) ?? []),
    );

    await write(`,"activities":${JSON.stringify(activities)}}`);
  } finally {
    stream.end();
    await finished(stream);
  }
};
