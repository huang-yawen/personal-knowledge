import { Router } from "express";
import { parseOptionalId, retrieveChunks } from "./retrieve";

export const ragRouter = Router();

// 检索接口：用于验证检索效果，问答接口内部复用同一个检索函数
ragRouter.post("/search", async (req, res) => {
  const body = (typeof req.body === "object" && req.body !== null ? req.body : {}) as Record<string, unknown>;
  const query = typeof body.query === "string" ? body.query.trim() : "";
  const knowledgeBaseId = parseOptionalId(body.knowledgeBaseId);
  const limit = body.limit === undefined ? undefined : Number(body.limit);
  // 相似度下限：不传则用配置值；传 0 可以关掉过滤，看到完整的分数分布，便于标定
  const minScore = body.minScore === undefined ? undefined : Number(body.minScore);

  if (!query || query.length > 500) {
    res.status(400).json({ error: "查询内容不能为空，且不能超过 500 个字符" });
    return;
  }
  if (knowledgeBaseId === "invalid") {
    res.status(400).json({ error: "知识库范围不正确" });
    return;
  }
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > 20)) {
    res.status(400).json({ error: "limit 需要在 1 到 20 之间" });
    return;
  }
  if (minScore !== undefined && (!Number.isFinite(minScore) || minScore < 0 || minScore > 1)) {
    res.status(400).json({ error: "minScore 需要在 0 到 1 之间" });
    return;
  }
  res.json(
    await retrieveChunks(query, {
      knowledgeBaseIds: knowledgeBaseId === undefined ? undefined : [knowledgeBaseId],
      limit,
      minScore,
    }),
  );
});
