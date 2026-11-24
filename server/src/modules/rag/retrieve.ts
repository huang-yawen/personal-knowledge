import type { RowDataPacket } from "mysql2";
import { config } from "../../config";
import { pool } from "../../db";
import { embedTexts } from "./embedding";
import { searchPoints } from "./qdrant";
import { rerankChunks } from "./rerank";
import { searchKeywordChunks, type KeywordHit } from "./keyword";
import { reciprocalRankFusion } from "./fuse";
import { currentUserId } from "../auth/context";

export type RetrievedChunk = {
  chunkId: number;
  knowledgeBaseId: number;
  documentId: number;
  documentName: string;
  page: number | null;
  content: string;
  // 向量相似度；只被关键词命中的分块没有余弦相似度，这里是 0
  score: number;
  // 这一条是从哪一路检索到的
  matchedBy: "dense" | "keyword" | "both";
};

// 检索失败时给用户看的提示：区分嵌入服务不可用和其他（向量库、数据库）不可用
export const describeRetrievalError = (error: unknown) =>
  error instanceof Error && error.message.startsWith("Embedding")
    ? "嵌入服务请求失败，请检查网络后重试"
    : "检索资料失败，请确认向量库（Qdrant）和数据库已启动后重试";

// 丢弃相似度低于下限的命中。宁可少给几条资料，也不要让模型拿不相关的内容硬凑答案；
// minScore 为 0 或负数表示不启用过滤
export const filterByScore = <T extends { score: number }>(hits: T[], minScore: number): T[] =>
  minScore > 0 ? hits.filter((hit) => hit.score >= minScore) : hits;

// 检索过程的统计，由调用方传入并填充，用于日志和标定阈值
export type RetrievalStats = {
  // 向量检索命中的条数（过滤前）
  candidates: number;
  // 因为低于相似度下限被丢弃的条数
  filtered: number;
  // 关键词路命中的条数
  keywordHits: number;
  rerankApplied: boolean;
  rerankDegraded: boolean;
  rerankMs: number | null;
  // 精排后各分块的分数（顺序与返回结果一致），用于标定 RERANK_MIN_SCORE
  rerankScores: number[] | null;
};

// 统计对象的初始值，避免每个调用方都手写一遍
export const emptyRetrievalStats = (): RetrievalStats => ({
  candidates: 0,
  filtered: 0,
  keywordHits: 0,
  rerankApplied: false,
  rerankDegraded: false,
  rerankMs: null,
  rerankScores: null,
});

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

// 召回池的大小：精排要有多余候选才有排序余地，融合也要两路都有货
const recallPoolSize = (finalLimit: number) =>
  Math.min(
    Math.max(finalLimit * config.retrieval.recallMultiplier, config.retrieval.recallFloor),
    config.retrieval.maxCandidates,
  );

/**
 * 检索：向量召回 →（可选）关键词召回 → RRF 融合 →（可选）精排 → 截断。
 *
 * 三件事都可独立开关：hybrid 决定要不要跑关键词那一路，rerank 决定要不要 cross-encoder 重排。
 * 精排返回 null 表示服务不可用，会退回当前顺序；返回空数组表示判定都不相关。
 */
export const retrieveChunks = async (
  query: string,
  options: {
    knowledgeBaseIds?: number[];
    limit?: number;
    minScore?: number;
    stats?: RetrievalStats;
    rerank?: boolean;
    hybrid?: boolean;
    // 精排用的查询（用户原话）。改写过的检索串适合找资料，但判断相关性用原话更准
    rerankQuery?: string;
    // 检索过程中的阶段回调，用于向前端推送「正在精排」这类状态
    onStage?: (stage: "reranking") => void;
  } = {},
): Promise<RetrievedChunk[]> => {
  const wantRerank = options.rerank ?? config.rerank.enabled;
  const wantHybrid = options.hybrid ?? config.retrieval.hybrid.enabled;
  const finalLimit = options.limit ?? config.retrieval.topK;
  const recallLimit = wantRerank || wantHybrid ? recallPoolSize(finalLimit) : finalLimit;

  const [vector] = await embedTexts([query]);
  const hits = await searchPoints(vector, {
    knowledgeBaseIds: options.knowledgeBaseIds,
    limit: recallLimit,
  });
  // 精排时会做真正的相关性判断，召回阶段的阈值可以放宽，避免在精排前误杀
  const minScore = options.minScore ?? (wantRerank ? config.retrieval.recallMinScore : config.retrieval.minScore);
  const kept = filterByScore(hits, minScore);

  // 关键词路：补向量检索对专有名词、型号、错误码不敏感的短板。
  // 这一路失败就退回纯向量结果，不能让主流程挂掉
  const keyword = wantHybrid
    ? await searchKeywordChunks(query, {
        knowledgeBaseIds: options.knowledgeBaseIds,
        limit: config.retrieval.hybrid.keywordLimit,
      }).catch((error: unknown) => {
        console.error("[retrieval] 关键词检索失败，只用向量结果", error);
        return [] as KeywordHit[];
      })
    : [];

  if (options.stats) {
    options.stats.candidates = hits.length;
    options.stats.filtered = hits.length - kept.length;
    options.stats.keywordHits = keyword.length;
    options.stats.rerankApplied = false;
    options.stats.rerankDegraded = false;
    options.stats.rerankMs = null;
    options.stats.rerankScores = null;
  }

  const hasDense = kept.length > 0;
  const hasKeyword = keyword.length > 0;
  if (!hasDense && !hasKeyword) return [];

  // 决定候选顺序：两路都有就融合名次，只有一路就按那一路的顺序
  const denseScore = new Map(kept.map((hit) => [hit.payload.chunk_id, hit.score]));
  const keywordIds = new Set(keyword.map((hit) => hit.chunkId));
  let orderedIds: number[];
  if (hasDense && hasKeyword) {
    orderedIds = reciprocalRankFusion(
      [kept.map((hit) => hit.payload.chunk_id), keyword.map((hit) => hit.chunkId)],
      { k: config.retrieval.hybrid.rrfK, limit: recallLimit },
    ).map((hit) => hit.id);
  } else if (hasDense) {
    orderedIds = kept.map((hit) => hit.payload.chunk_id);
  } else {
    orderedIds = keyword.map((hit) => hit.chunkId);
  }

  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT c.id, c.knowledge_base_id, c.document_id, c.content, c.page_number, d.original_name
     FROM document_chunks c JOIN documents d ON d.id = c.document_id
     WHERE c.id IN (?) AND c.user_id = ?`,
    [orderedIds, currentUserId()],
  );
  const byId = new Map(rows.map((row) => [row.id as number, row]));
  const chunks: RetrievedChunk[] = orderedIds.flatMap((chunkId) => {
    const row = byId.get(chunkId);
    if (!row) return [];
    const dense = denseScore.get(chunkId);
    return [
      {
        chunkId,
        knowledgeBaseId: row.knowledge_base_id as number,
        documentId: row.document_id as number,
        documentName: row.original_name as string,
        page: row.page_number as number | null,
        content: row.content as string,
        score: dense ?? 0,
        matchedBy: dense === undefined ? "keyword" : keywordIds.has(chunkId) ? "both" : "dense",
      },
    ];
  });

  if (!wantRerank) return chunks.slice(0, finalLimit);

  // 精排：null 表示服务不可用，退回当前顺序；空数组表示精排判定都不相关
  // 只有真的会调用精排时才通知，避免前端显示一个不会发生的阶段
  if (chunks.length > 1) options.onStage?.("reranking");
  const rerankStartedAt = Date.now();
  const reranked = await rerankChunks(options.rerankQuery ?? query, chunks, { limit: finalLimit });
  if (options.stats) {
    options.stats.rerankMs = Date.now() - rerankStartedAt;
    options.stats.rerankApplied = reranked !== null;
    options.stats.rerankDegraded = reranked === null;
    options.stats.rerankScores = reranked?.map((chunk) => Number(chunk.rerankScore.toFixed(3))) ?? null;
  }
  if (reranked === null) return chunks.slice(0, finalLimit);
  // 影子模式：照常打分并记录，但结果仍用当前顺序
  if (config.rerank.shadow) return chunks.slice(0, finalLimit);
  return reranked;
};
