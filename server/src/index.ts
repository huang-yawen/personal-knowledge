import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import { config } from "./config";
import { pool } from "./db";
import { documentRouter } from "./modules/document/routes";
import { resumeQueue } from "./modules/worker/queue";
import { chatRouter } from "./modules/chat/routes";
import { conversationRouter } from "./modules/conversation/routes";
import { ragRouter } from "./modules/rag/routes";
import { activityRouter } from "./modules/activity/routes";
import { knowledgeBaseRouter } from "./modules/knowledge-base/routes";
import { noteRouter } from "./modules/note/routes";
import { authRouter } from "./modules/auth/routes";
import { requireAuth, sameOriginOnly } from "./modules/auth/middleware";
import type { AuthedRequest } from "./modules/auth/context";
import { dailyTokenQuota, userRateLimit } from "./modules/usage";
import { statsRouter } from "./modules/usage/routes";
import { settingsRouter } from "./modules/settings/routes";
import { accountRouter } from "./modules/account/routes";

const app = express();
// 部署在本机 nginx 之后：信任回环代理，req.secure / req.ip 才能反映真实请求
app.set("trust proxy", "loopback");
app.use(express.json({ limit: "1mb" }));

// 健康检查：同时确认数据库连接可用
app.get("/api/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok", db: "up" });
  } catch {
    res.status(503).json({ status: "degraded", db: "down" });
  }
});

// 结构化请求日志：每个请求结束时一行 JSON，不记录查询串、请求体和 Cookie
app.use("/api", (req, res, next) => {
  const startedAt = Date.now();
  res.on("finish", () => {
    console.log(
      JSON.stringify({
        event: "request",
        method: req.method,
        path: req.originalUrl.split("?")[0],
        status: res.statusCode,
        ms: Date.now() - startedAt,
        userId: (req as Partial<AuthedRequest>).userId ?? null,
        ip: req.ip,
      }),
    );
  });
  next();
});

// 账户接口无需登录；其余 /api 接口都必须先登录，写操作还要求来自本站
app.use("/api", sameOriginOnly);
app.use("/api/auth", authRouter);
app.use("/api", requireAuth);

// 限流与额度：所有接口有总体频率上限；调用模型的接口再单独限流并检查每日 token 额度；上传和重试处理单独限流
app.use("/api", userRateLimit("api", config.limits.apiPerMinute));
app.use("/api/chat", userRateLimit("chat", config.limits.chatPerMinute), dailyTokenQuota);
const aiGuard = [userRateLimit("ai", config.limits.aiPerMinute), dailyTokenQuota];
app.post("/api/notes/ai", ...aiGuard);
app.post("/api/notes/generate", ...aiGuard);
app.post("/api/conversations/:id/summary", ...aiGuard);
app.get("/api/account/export", userRateLimit("export", 3));
const uploadLimit = userRateLimit("upload", config.limits.uploadPerMinute);
app.post("/api/knowledge-bases/:id/documents", uploadLimit);
app.post("/api/documents/:id/retry", uploadLimit);

app.use("/api/knowledge-bases", knowledgeBaseRouter);
app.use("/api", documentRouter);
app.use("/api", ragRouter);
app.use("/api", activityRouter);
app.use("/api/chat", chatRouter);
app.use("/api/conversations", conversationRouter);
app.use("/api/notes", noteRouter);
app.use("/api/settings", settingsRouter);
app.use("/api/stats", statsRouter);
app.use("/api/account", accountRouter);

// 兜底错误处理：未预期的异常统一返回 JSON，细节只写日志
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(500).json({ error: "服务器内部错误" });
});

// 只监听本机，对外只经 nginx 暴露
app.listen(config.port, "127.0.0.1", () => {
  console.log(`API 已启动：http://localhost:${config.port}`);
  resumeQueue().catch((error: unknown) =>
    console.error("恢复处理队列失败", error),
  );
});
