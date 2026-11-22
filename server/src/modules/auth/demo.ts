import type { RequestHandler } from "express";
import type { RowDataPacket } from "mysql2";
import { pool } from "../../db";
import { currentUserId } from "./context";

// 缓存 is_demo，避免每个请求都查一次库；演示标记基本不会变
const cache = new Map<number, boolean>();

export const isDemoUser = async (userId: number) => {
  const cached = cache.get(userId);
  if (cached !== undefined) return cached;
  const [rows] = await pool.query<RowDataPacket[]>("SELECT is_demo FROM users WHERE id = ?", [userId]);
  const value = Boolean(rows[0]?.is_demo);
  cache.set(userId, value);
  return value;
};

// 演示账号允许的写操作：提问本身是 POST，但它是演示的核心；
// 退出登录也要放行，否则演示账号无法正常登出
const WRITE_ALLOWLIST = [/^\/chat$/, /^\/auth\/logout$/];

/**
 * 演示账号能不能发这个请求。
 * 读方法一律放行；写方法只放行白名单——上传、删除、改设置、改密码等都会被拒。
 */
export const demoRequestAllowed = (method: string, path: string) =>
  method === "GET" || method === "HEAD" || method === "OPTIONS" || WRITE_ALLOWLIST.some((pattern) => pattern.test(path));

// 挂在 requireAuth 之后：演示账号的写操作直接 403，前端会把这句话显示出来
export const readOnlyForDemo: RequestHandler = async (req, res, next) => {
  if (!(await isDemoUser(currentUserId()))) return next();
  if (demoRequestAllowed(req.method, req.path)) return next();
  res.status(403).json({ error: "演示账号为只读：可以浏览知识库和提问，但不能新增、修改或删除任何内容。" });
};
