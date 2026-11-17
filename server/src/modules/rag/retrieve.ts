import type { RowDataPacket } from "mysql2";
import { config } from "../../config";
import { pool } from "../../db";
import { embedTexts } from "./embedding";
import { searchPoints } from "./qdrant";
import { currentUserId } from "../auth/context";

export type RetrievedChunk = {
  chunkId: number;
  knowledgeBaseId: number;
  documentId: number;
  documentName: string;
  page: number | null;
  content: string;
  score: number;
};

// 检索失败时给用户看的提示：区分嵌入服务不可用和其他（向量库、数据库）不可用
export const describeRetrievalError = (error: unknown) =>
  error instanceof Error && error.message.startsWith("Embedding")
    ? "嵌入服务请求失败，请检查网络后重试"
    : "检索资料失败，请确认向量库（Qdrant）和数据库已启动后重试";

// 丢弃相似度低于下限的命中。宁可少给几条资料，也不要让模型拿不相关的内容硬凑答案；
// minScore 为 0 或负数表示不启用过滤。返回数量供调用方记录日志
export const filterByScore = <T extends { score: number }>(hits: T[], minScore: number): T[] =>
  minScore > 0 ? hits.filter((hit) => hit.score >= minScore) : hits;

// 检索过程的统计，由调用方传入并填充，用于日志和标定相似度下限
export type RetrievalStats = {
  // 向量检索命中的条数（过滤前）
  candidates: number;
  // 因为低于相似度下限被丢弃的条数
  filtered: number;
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
    currentUserId(),
    ids,
  ]);
  return rows.length === ids.length;
};

// 向量检索命中后，以 MySQL 中的分块为准取正文；已被删除但向量残留的分块会被自然丢弃。
// 先按相似度下限过滤再取正文：Qdrant 返回的分数是从高到低排的，所以只取前 limit 条再过滤不会漏掉更高分的
export const retrieveChunks = async (
  query: string,
  options: { knowledgeBaseIds?: number[]; limit?: number; minScore?: number; stats?: RetrievalStats } = {},
): Promise<RetrievedChunk[]> => {
  const [vector] = await embedTexts([query]);
  const hits = await searchPoints(vector, {
    knowledgeBaseIds: options.knowledgeBaseIds,
    limit: options.limit ?? config.retrieval.topK,
  });
  const kept = filterByScore(hits, options.minScore ?? config.retrieval.minScore);
  if (options.stats) {
    options.stats.candidates = hits.length;
    options.stats.filtered = hits.length - kept.length;
  }
  if (kept.length === 0) return [];

  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT c.id, c.knowledge_base_id, c.document_id, c.content, c.page_number, d.original_name
     FROM document_chunks c JOIN documents d ON d.id = c.document_id
     WHERE c.id IN (?) AND c.user_id = ?`,
    [kept.map((hit) => hit.payload.chunk_id), currentUserId()],
  );
  const byId = new Map(rows.map((row) => [row.id as number, row]));
  return kept.flatMap((hit) => {
    const row = byId.get(hit.payload.chunk_id);
    if (!row) return [];
    return [
      {
        chunkId: row.id as number,
        knowledgeBaseId: row.knowledge_base_id as number,
        documentId: row.document_id as number,
        documentName: row.original_name as string,
        page: row.page_number as number | null,
        content: row.content as string,
        score: hit.score,
      },
    ];
  });
};
