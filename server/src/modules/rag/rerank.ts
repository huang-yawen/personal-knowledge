import { config } from "../../config";
import type { RetrievedChunk } from "./retrieve";

// 精排后的分块：保留原分块的全部字段，额外带上 cross-encoder 给出的相关性分
export type RerankedChunk = RetrievedChunk & { rerankScore: number };

// rerank 接口返回的单条结果，index 是它在 documents 数组里的下标
export type RerankResultItem = { index: number; relevance_score: number };

// 便于测试时注入假的 fetch
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/**
 * 把接口返回的 index/score 映射回原分块，排序、过滤、截断。
 *
 * 单独抽成纯函数是为了能脱离网络测试：index 映射错位会让引用指向错误的片段，
 * 这是这类功能里最难在线上发现的一类 bug。
 */
export const applyRerankResults = (
  chunks: RetrievedChunk[],
  results: RerankResultItem[],
  options: { limit?: number; minScore?: number } = {},
): RerankedChunk[] => {
  const picked: RerankedChunk[] = [];
  const seen = new Set<number>();
  for (const item of results) {
    const index = item.index;
    // 越界、非整数、重复的下标一律丢弃：宁可少一条，也不能张冠李戴
    if (!Number.isInteger(index) || index < 0 || index >= chunks.length || seen.has(index)) continue;
    const rerankScore = Number(item.relevance_score);
    if (!Number.isFinite(rerankScore)) continue;
    seen.add(index);
    picked.push({ ...chunks[index], rerankScore });
  }

  // 接口并不保证有序，这里统一再排一次
  picked.sort((a, b) => b.rerankScore - a.rerankScore);

  const { limit, minScore } = options;
  const filtered = minScore === undefined ? picked : picked.filter((chunk) => chunk.rerankScore >= minScore);
  return limit === undefined ? filtered : filtered.slice(0, limit);
};

/**
 * 调用 rerank 服务给候选分块打分并重排。
 *
 * 返回值有三种含义，调用方必须区分：
 *   null  → 服务不可用/超时/格式异常，调用方应退回向量排序（降级）
 *   []    → 精排判断这些候选都不相关，调用方应走「没有找到资料」的分支
 *   [...] → 正常结果，已按相关性从高到低排好
 */
export const rerankChunks = async (
  query: string,
  chunks: RetrievedChunk[],
  options: { limit?: number; signal?: AbortSignal; fetchImpl?: FetchLike; enabled?: boolean } = {},
): Promise<RerankedChunk[] | null> => {
  // 没开启，或只有一条（没什么可排的），省掉一次调用
  const enabled = options.enabled ?? config.rerank.enabled;
  if (!enabled || chunks.length <= 1) return null;

  const doFetch = options.fetchImpl ?? fetch;
  const timeout = AbortSignal.timeout(config.rerank.timeoutMs);
  try {
    const response = await doFetch(`${config.rerank.baseUrl}/rerank`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.rerank.apiKey}` },
      body: JSON.stringify({
        model: config.rerank.model,
        query,
        documents: chunks.map((chunk) => chunk.content),
        top_n: options.limit ?? chunks.length,
        return_documents: false,
      }),
      signal: options.signal ? AbortSignal.any([options.signal, timeout]) : timeout,
    });
    if (!response.ok) {
      console.error("[rerank] 请求失败", response.status, (await response.text()).slice(0, 200));
      return null;
    }
    const data = (await response.json()) as { results?: RerankResultItem[] };
    if (!Array.isArray(data.results) || data.results.length === 0) {
      console.error("[rerank] 返回为空或格式不正确");
      return null;
    }
    return applyRerankResults(chunks, data.results, { limit: options.limit, minScore: config.rerank.minScore });
  } catch (error) {
    // 用户主动中断时不记日志，其余情况都要留下痕迹，便于判断是否经常降级
    if (!options.signal?.aborted) console.error("[rerank] 调用失败，退回向量排序：", error);
    return null;
  }
};
