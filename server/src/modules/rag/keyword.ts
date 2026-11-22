import type { RowDataPacket } from "mysql2";
import { pool } from "../../db";
import { currentUserId } from "../auth/context";

export type KeywordHit = { chunkId: number; score: number };

/**
 * 清理 BOOLEAN MODE 的运算符。
 * `+ - > < ( ) ~ * " @` 在布尔全文检索里都有特殊含义，用户输入里出现会让查询语法出错，
 * 或者意外变成「排除」「通配」这类语义，所以统一换成空格。
 */
export const toBooleanQuery = (query: string) =>
  query
    .replace(/[+\-<>()~*"@]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/**
 * 关键词检索：走 MySQL 的 ngram 全文索引，返回分块 id 和相关性分。
 *
 * 这一路的价值在于「字面命中」——型号、人名、错误码、代码标识符这类内容，
 * 向量检索经常抓不住，而这类查询在个人知识库里很常见。
 */
export const searchKeywordChunks = async (
  query: string,
  options: { knowledgeBaseIds?: number[]; limit?: number } = {},
): Promise<KeywordHit[]> => {
  const booleanQuery = toBooleanQuery(query);
  // 清理后为空（比如整句都是符号）就不查了，避免空查询返回一堆无关结果
  if (!booleanQuery) return [];

  const knowledgeBaseIds = options.knowledgeBaseIds ?? [];
  const params: (string | number | number[])[] = [booleanQuery, currentUserId(), booleanQuery];
  if (knowledgeBaseIds.length > 0) params.push(knowledgeBaseIds);
  params.push(options.limit ?? 20);

  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT c.id AS chunkId, MATCH(c.content) AGAINST (? IN BOOLEAN MODE) AS score
     FROM document_chunks c
     WHERE c.user_id = ? AND MATCH(c.content) AGAINST (? IN BOOLEAN MODE)
       ${knowledgeBaseIds.length > 0 ? "AND c.knowledge_base_id IN (?)" : ""}
     ORDER BY score DESC, c.id
     LIMIT ?`,
    params,
  );

  return rows.map((row) => ({ chunkId: Number(row.chunkId), score: Number(row.score) }));
};
