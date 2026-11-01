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

const app = express();
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

// 账户接口无需登录；其余 /api 接口都必须先登录，写操作还要求来自本站
app.use("/api", sameOriginOnly);
app.use("/api/auth", authRouter);
app.use("/api", requireAuth);

app.use("/api/knowledge-bases", knowledgeBaseRouter);
app.use("/api", documentRouter);
app.use("/api", ragRouter);
app.use("/api", activityRouter);
app.use("/api/chat", chatRouter);
app.use("/api/conversations", conversationRouter);
app.use("/api/notes", noteRouter);

// 兜底错误处理：未预期的异常统一返回 JSON，细节只写日志
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(500).json({ error: "服务器内部错误" });
});

app.listen(config.port, () => {
  console.log(`API 已启动：http://localhost:${config.port}`);
  resumeQueue().catch((error: unknown) =>
    console.error("恢复处理队列失败", error),
  );
});
