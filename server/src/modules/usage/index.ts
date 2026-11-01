import type { RequestHandler } from "express";
import type { RowDataPacket } from "mysql2";
import { config } from "../../config";
import { pool } from "../../db";
import { currentUserId } from "../auth/context";

export type UsageKind = "chat" | "followup" | "summary" | "note_ai" | "note_generate";

type Window = { count: number; resetAt: number };
const MAX_ENTRIES = 10_000;
const windows = new Map<string, Window>();

// 按用户的固定窗口限流：进程内计数，服务重启会清零，单机部署够用。必须挂在 requireAuth 之后
export const userRateLimit =
  (name: string, max: number, windowMs = 60_000): RequestHandler =>
  (_req, res, next) => {
    const key = `${name}:${currentUserId()}`;
    const now = Date.now();
    let entry = windows.get(key);
    if (!entry || entry.resetAt <= now) {
      // 防止记录无限增长：满了先清掉已过期的
      if (windows.size >= MAX_ENTRIES) for (const [k, w] of windows) if (w.resetAt <= now) windows.delete(k);
      entry = { count: 0, resetAt: now + windowMs };
      windows.set(key, entry);
    }
    entry.count += 1;
    if (entry.count > max) {
      res.setHeader("Retry-After", Math.ceil((entry.resetAt - now) / 1000));
      res.status(429).json({ error: "操作太频繁，请稍后再试" });
      return;
    }
    next();
  };

// 今天（数据库时区）已用的 token 数
export const todayTokens = async (userId: number): Promise<number> => {
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT COALESCE(SUM(tokens), 0) AS used FROM usage_logs WHERE user_id = ? AND created_at >= CURDATE()",
    [userId],
  );
  return Number(rows[0].used);
};

// 调用模型前检查每日额度，用完后直接拒绝
export const dailyTokenQuota: RequestHandler = async (_req, res, next) => {
  if ((await todayTokens(currentUserId())) >= config.limits.dailyTokens) {
    res.status(429).json({ error: "今日模型额度已用完，请明天再试" });
    return;
  }
  next();
};

// 记录一次模型调用的 token；记账失败只写日志，不影响本次请求
export const recordUsage = (kind: UsageKind, tokens: number | undefined) => {
  if (!tokens || tokens <= 0) return;
  pool
    .query("INSERT INTO usage_logs (user_id, kind, tokens) VALUES (?, ?, ?)", [currentUserId(), kind, Math.round(tokens)])
    .catch((error: unknown) => console.error("记录用量失败", error));
};

// 用户中途停止时模型不会返回 usage，按字符数粗略估算（中文约 1.5 字符一个 token），避免“边生成边取消”绕过额度
export const estimateTokens = (chars: number) => Math.ceil(chars / 1.5);
