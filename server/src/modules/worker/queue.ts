import path from "node:path";
import type { RowDataPacket } from "mysql2";
import { config } from "../../config";
import { pool } from "../../db";
import { chunkText } from "./chunk";
import { parseFile } from "./parse";

const INSERT_BATCH = 500;
const pending: number[] = [];
let running = false;

const setStatus = (id: number, status: string) => pool.query("UPDATE documents SET status = ? WHERE id = ?", [status, id]);

// 解析 → 分块 → 写入 document_chunks。向量化尚未接入，成功后停在 embedding 状态
const processDocument = async (id: number) => {
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT user_id, knowledge_base_id, stored_path, mime_type FROM documents WHERE id = ?",
    [id],
  );
  const doc = rows[0];
  if (!doc) return; // 排队期间文档已被删除

  try {
    await setStatus(id, "parsing");
    const pages = await parseFile(path.join(config.uploadDir, doc.stored_path), doc.mime_type);

    // 分块不跨页，保证每个块的页码准确
    const values: (number | string | null)[][] = [];
    for (const { page, text } of pages) {
      for (const content of chunkText(text)) {
        values.push([doc.user_id, doc.knowledge_base_id, id, values.length, content, page]);
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
          "INSERT INTO document_chunks (user_id, knowledge_base_id, document_id, chunk_index, content, page_number) VALUES ?",
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
  } catch (error) {
    console.error(`文档 ${id} 处理失败`, error);
    const message = error instanceof Error ? error.message : String(error);
    await pool.query("UPDATE documents SET status = 'failed', error_message = ? WHERE id = ?", [
      message.slice(0, 1000),
      id,
    ]);
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

// 服务重启后，把中断在“等待 / 解析中”的文档重新排队
export const resumeQueue = async () => {
  await pool.query("UPDATE documents SET status = 'pending' WHERE status = 'parsing'");
  const [rows] = await pool.query<RowDataPacket[]>("SELECT id FROM documents WHERE status = 'pending' ORDER BY id");
  for (const row of rows) enqueue(row.id as number);
};
