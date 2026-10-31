import express from "express";
import { config } from "./config";
import { pool } from "./db";

const app = express();
app.use(express.json());

// 健康检查：同时确认数据库连接可用
app.get("/api/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok", db: "up" });
  } catch {
    res.status(503).json({ status: "degraded", db: "down" });
  }
});

app.listen(config.port, () => {
  console.log(`API 已启动：http://localhost:${config.port}`);
});
