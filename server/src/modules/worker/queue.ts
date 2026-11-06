import { randomUUID } from "node:crypto";
import path from "node:path";
import type { RowDataPacket } from "mysql2";
import { config } from "../../config";
import { pool } from "../../db";
import { recordActivity } from "../activity/repository";
import { embedTexts } from "../rag/embedding";
import { deleteVectors, upsertPoints } from "../rag/qdrant";
import { chunkText } from "./chunk";
import { runAsUser } from "../auth/context";
import { parseFile } from "./parse";
import { summarizeDocument } from "./summary";

const INSERT_BATCH = 500;
const pending: number[] = [];
let running = false;

const setStatus = (id: number, status: string) => pool.query("UPDATE documents SET status = ? WHERE id = ?", [status, id]);

// 为文档的所有分块生成向量并写入 Qdrant；先清掉该文档可能残留的旧向量，重复处理不会产生重复数据
const embedChunks = async (id: number, userId: number, knowledgeBaseId: number) => {
  const [chunks] = await pool.query<RowDataPacket[]>(
    "SELECT id, content, page_number, vector_point_id FROM document_chunks WHERE document_id = ? ORDER BY chunk_index",
    [id],
  );
  const vectors = await embedTexts(chunks.map((chunk) => chunk.content as string));
  await deleteVectors("document_id", id);
  await upsertPoints(
    chunks.map((chunk, index) => ({
      id: chunk.vector_point_id as string,
      vector: vectors[index],
      payload: {
        user_id: userId,
        knowledge_base_id: knowledgeBaseId,
        document_id: id,
        chunk_id: chunk.id as number,
        page_number: chunk.page_number as number | null,
      },
    })),
  );
};

// 解析 → 分块 → 写入 document_chunks → 向量化写入 Qdrant，全部成功后状态为 done
const processDocument = async (id: number) => {
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT user_id, knowledge_base_id, stored_path, mime_type, original_name FROM documents WHERE id = ?",
    [id],
  );
  const doc = rows[0];
  if (!doc) return; // 排队期间文档已被删除

  try {
    await setStatus(id, "parsing");
    // OCR 要按用户记账和判断额度，所以放进用户上下文里解析
    const pages = await runAsUser(doc.user_id as number, () =>
      parseFile(path.join(config.uploadDir, doc.stored_path), doc.mime_type),
    );

    // 分块不跨页，保证每个块的页码准确
    const values: (number | string | null)[][] = [];
    for (const { page, text } of pages) {
      for (const content of chunkText(text)) {
        values.push([doc.user_id, doc.knowledge_base_id, id, values.length, content, page, randomUUID()]);
      }
    }
    if (values.length === 0) throw new Error("未提取到文本，可能是扫描版 PDF 或空文件");

    // 先清掉旧分块再写入，重复处理同一文档不会产生重复数据
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.query("DELETE FROM document_chunks WHERE document_id = ?", [id]);
      for (let i = 0; i < values.length; i += INSERT_BATCH) {
        await conn.query(
          "INSERT INTO document_chunks (user_id, knowledge_base_id, document_id, chunk_index, content, page_number, vector_point_id) VALUES ?",
          [values.slice(i, i + INSERT_BATCH)],
        );
      }
      await conn.query("UPDATE documents SET status = 'embedding', error_message = NULL WHERE id = ?", [id]);
      await conn.commit();
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }

    try {
      await embedChunks(id, doc.user_id, doc.knowledge_base_id);
    } catch (error) {
      throw new Error(`向量化失败：${error instanceof Error ? error.message : String(error)}`);
    }
    await setStatus(id, "done");
    await recordActivity(doc.user_id, "doc_ready", doc.original_name, id);
    // 摘要在后台生成，不阻塞队列里的下一份文档
    void summarizeDocument(id, doc.user_id);
  } catch (error) {
    console.error(`文档 ${id} 处理失败`, error);
    const message = error instanceof Error ? error.message : String(error);
    await pool.query("UPDATE documents SET status = 'failed', error_message = ? WHERE id = ?", [
      message.slice(0, 1000),
      id,
    ]);
    await recordActivity(doc.user_id, "doc_failed", doc.original_name, id);
  }
};

// 单队列依次处理，避免同时解析多个大文件占满内存
const drain = async () => {
  if (running) return;
  running = true;
  try {
    for (let id = pending.shift(); id !== undefined; id = pending.shift()) await processDocument(id);
  } finally {
    running = false;
  }
};

export const enqueue = (id: number) => {
  pending.push(id);
  void drain();
};

// 服务重启后，把中断在“等待 / 解析中 / 向量化中”的文档重新排队
export const resumeQueue = async () => {
  await pool.query("UPDATE documents SET status = 'pending' WHERE status IN ('parsing', 'embedding')");
  const [rows] = await pool.query<RowDataPacket[]>("SELECT id FROM documents WHERE status = 'pending' ORDER BY id");
  for (const row of rows) enqueue(row.id as number);
};
