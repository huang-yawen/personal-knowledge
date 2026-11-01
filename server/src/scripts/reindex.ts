import type { RowDataPacket } from "mysql2";
import { pool } from "../db";
import { embedTexts } from "../modules/rag/embedding";
import { deleteVectors, upsertPoints } from "../modules/rag/qdrant";

// 按 MySQL 中已有的分块重建 Qdrant 向量（迁移、恢复备份、换向量库后使用）：npm run reindex
// 会调用 Embedding 接口，文档多时会消耗额度
const [docs] = await pool.query<RowDataPacket[]>("SELECT id, user_id, knowledge_base_id FROM documents WHERE status = 'done'");
for (const doc of docs) {
  const [chunks] = await pool.query<RowDataPacket[]>(
    "SELECT id, content, page_number, vector_point_id FROM document_chunks WHERE document_id = ? ORDER BY chunk_index",
    [doc.id],
  );
  const vectors = await embedTexts(chunks.map((chunk) => chunk.content as string));
  await deleteVectors("document_id", doc.id as number);
  await upsertPoints(
    chunks.map((chunk, index) => ({
      id: chunk.vector_point_id as string,
      vector: vectors[index],
      payload: {
        user_id: doc.user_id as number,
        knowledge_base_id: doc.knowledge_base_id as number,
        document_id: doc.id as number,
        chunk_id: chunk.id as number,
        page_number: chunk.page_number as number | null,
      },
    })),
  );
  console.log(`文档 ${doc.id}：${chunks.length} 个分块已写入`);
}
console.log(`完成，共 ${docs.length} 份文档`);
await pool.end();
