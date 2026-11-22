export type FusedHit = { id: number; score: number };

/**
 * Reciprocal Rank Fusion：把多路检索结果按「名次」融合，不需要各路分数在同一量纲上。
 *
 *   score(d) = Σ 1 / (k + rank(d))     rank 从 1 开始，k 默认 60
 *
 * 向量分是余弦相似度、关键词分是 MySQL 的 relevance，两者不可比；融合名次则没有这个问题。
 * 同时出现在两路里的条目会累加，因此天然被排到前面。
 */
export const reciprocalRankFusion = (
  lists: number[][],
  options: { k?: number; limit?: number } = {},
): FusedHit[] => {
  const k = options.k ?? 60;
  const scores = new Map<number, number>();

  for (const list of lists) {
    const seenInList = new Set<number>();
    list.forEach((id, index) => {
      // 同一路里重复出现的只按最好名次算一次
      if (seenInList.has(id)) return;
      seenInList.add(id);
      scores.set(id, (scores.get(id) ?? 0) + 1 / (k + index + 1));
    });
  }

  // 分数相同时按 id 升序，保证同样的输入永远得到同样的顺序
  const fused = [...scores.entries()]
    .map(([id, score]) => ({ id, score }))
    .sort((a, b) => b.score - a.score || a.id - b.id);

  return options.limit === undefined ? fused : fused.slice(0, options.limit);
};
