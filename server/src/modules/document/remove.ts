import { rm } from "node:fs/promises";
import path from "node:path";
import type { RowDataPacket } from "mysql2";
import { config } from "../../config";
import { pool } from "../../db";
import { deleteVectors } from "../rag/qdrant";
import { currentUserId } from "../auth/context";

// 删除文档：记录、磁盘文件和向量。文档不存在或不属于当前用户时返回 false
export const removeDocument = async (id: number) => {
  const [rows] = await pool.query<RowDataPacket[]>("SELECT stored_path FROM documents WHERE id = ? AND user_id = ?", [
    id,
    currentUserId(),
  ]);
  if (rows.length === 0) return false;
  // 先删记录再删文件：即使删文件失败，也不会留下指向不存在文件的记录
  await pool.query("DELETE FROM documents WHERE id = ? AND user_id = ?", [id, currentUserId()]);
  await rm(path.join(config.uploadDir, rows[0].stored_path as string), { force: true });
  // 向量清理失败不影响删除；检索时会以 MySQL 中的分块为准，残留向量不会被引用
  await deleteVectors("document_id", id).catch((error: unknown) => console.error("删除向量失败", error));
  return true;
};
