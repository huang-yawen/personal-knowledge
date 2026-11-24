import { access } from "node:fs/promises";
import path from "node:path";
import type { RowDataPacket } from "mysql2";
import { config } from "../config";
import { pool } from "../db";
import { processDocument } from "../modules/worker/queue";

// 用当前切片策略重新处理已有文档：npm run rechunk
// 会重新解析、切块、生成 Embedding，扫描件还可能触发 OCR，消耗额度。
// 不生成摘要、不写轨迹，避免重复通知和额外模型调用。
const [docs] = await pool.query<RowDataPacket[]>(
  "SELECT id, original_name, stored_path FROM documents WHERE status IN ('done', 'failed') ORDER BY id",
);

let processed = 0;
let skipped = 0;
for (const doc of docs) {
  try {
    await access(path.join(config.uploadDir, doc.stored_path as string));
  } catch {
    console.warn(`跳过文档 ${doc.id}（${doc.original_name}）：原文件不存在`);
    skipped += 1;
    continue;
  }
  console.log(`重新切片 ${doc.id}：${doc.original_name}`);
  await processDocument(doc.id as number, { summarize: false, activity: false });
  processed += 1;
}

const [counts] = await pool.query<RowDataPacket[]>(
  "SELECT status, COUNT(*) AS count FROM documents GROUP BY status ORDER BY status",
);
console.log(`完成：处理 ${processed} 份，跳过 ${skipped} 份`);
console.log(counts.map((row) => `${row.status}: ${row.count}`).join("，"));
await pool.end();
