import { Router } from "express";
import { ownsKnowledgeBases, parseIdList } from "../rag/retrieve";
import { getSettings, MAX_TOP_K, REPLY_STYLES, saveSettings, type ReplyStyle } from "./repository";

export const settingsRouter = Router();

settingsRouter.get("/", async (_req, res) => {
  res.json(await getSettings());
});

// 整体替换：三项都必须传
settingsRouter.put("/", async (req, res) => {
  const body = (typeof req.body === "object" && req.body !== null ? req.body : {}) as Record<string, unknown>;
  const replyStyle = REPLY_STYLES.find((style) => style === body.replyStyle);
  const topK = body.topK;
  const ids = parseIdList(body.defaultKnowledgeBaseIds);
  if (!replyStyle || typeof topK !== "number" || !Number.isInteger(topK) || topK < 1 || topK > MAX_TOP_K || ids === "invalid") {
    res.status(400).json({ error: `设置格式不正确（资料条数需为 1 到 ${MAX_TOP_K}）` });
    return;
  }
  if (!(await ownsKnowledgeBases(ids))) {
    res.status(404).json({ error: "知识库不存在" });
    return;
  }
  await saveSettings({ replyStyle: replyStyle as ReplyStyle, topK, defaultKnowledgeBaseIds: ids });
  res.json(await getSettings());
});
