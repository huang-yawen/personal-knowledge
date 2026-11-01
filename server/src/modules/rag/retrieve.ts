import type { RowDataPacket } from "mysql2";
import { config } from "../../config";
import { pool } from "../../db";
import { embedTexts } from "./embedding";
import { searchPoints } from "./qdrant";

export type RetrievedChunk = {
  chunkId: number;
  documentId: number;
  documentName: string;
  page: number | null;
  content: string;
  score: number;
};

// 请求里的可选 id（如知识库范围）：不传或 null 表示未指定；非法值返回 "invalid"
export const parseOptionalId = (value: unknown): number | undefined | "invalid" => {
  if (value === undefined || value === null) return undefined;
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : "invalid";
};

// 请求里的知识库范围列表：不传或 null 表示全部（空数组）；必须是不超过 50 个的正整数，非法值返回 "invalid"
export const parseIdList = (value: unknown): number[] | "invalid" => {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > 50) return "invalid";
  if (!value.every((item) => typeof item === "number" && Number.isInteger(item) && item > 0)) return "invalid";
  return [...new Set(value as number[])];
};

// 指定的知识库必须都属于当前用户
export const ownsKnowledgeBases = async (ids: number[]) => {
  if (ids.length === 0) return true;
  const [rows] = await pool.query<RowDataPacket[]>("SELECT id FROM knowledge_bases WHERE user_id = ? AND id IN (?)", [
    config.devUserId,
    ids,
  ]);
  return rows.length === ids.length;
};

// 向量检索命中后，以 MySQL 中的分块为准取正文；已被删除但向量残留的分块会被自然丢弃
export const retrieveChunks = async (
  query: string,
  options: { knowledgeBaseIds?: number[]; limit?: number } = {},
): Promise<RetrievedChunk[]> => {
  const [vector] = await embedTexts([query]);
  const hits = await searchPoints(vector, {
    knowledgeBaseIds: options.knowledgeBaseIds,
    limit: options.limit ?? config.retrieval.topK,
  });
  if (hits.length === 0) return [];

  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT c.id, c.document_id, c.content, c.page_number, d.original_name
     FROM document_chunks c JOIN documents d ON d.id = c.document_id
     WHERE c.id IN (?) AND c.user_id = ?`,
    [hits.map((hit) => hit.payload.chunk_id), config.devUserId],
  );
  const byId = new Map(rows.map((row) => [row.id as number, row]));
  return hits.flatMap((hit) => {
    const row = byId.get(hit.payload.chunk_id);
    if (!row) return [];
    return [
      {
        chunkId: row.id as number,
        documentId: row.document_id as number,
        documentName: row.original_name as string,
        page: row.page_number as number | null,
        content: row.content as string,
        score: hit.score,
      },
    ];
  });
};
