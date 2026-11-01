import { createHash, randomBytes } from "node:crypto";
import type { Request, Response } from "express";
import type { RowDataPacket } from "mysql2";
import { pool } from "../../db";

export const SESSION_COOKIE = "pk_session";
const SESSION_DAYS = 30;
const SESSION_MS = SESSION_DAYS * 24 * 60 * 60 * 1000;

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

// 数据库只存令牌的哈希，即使数据库泄露也不能直接拿去登录
export const createSession = async (userId: number, req: Request, res: Response) => {
  const token = randomBytes(32).toString("base64url");
  await pool.query("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)", [
    hashToken(token),
    userId,
    new Date(Date.now() + SESSION_MS),
  ]);
  res.cookie(SESSION_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: req.secure, maxAge: SESSION_MS, path: "/" });
};

export const readSessionToken = (req: Request): string | undefined => {
  for (const part of (req.headers.cookie ?? "").split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === SESSION_COOKIE) return rest.join("=") || undefined;
  }
  return undefined;
};

// 返回令牌对应的用户 id；已过期或不存在返回 undefined
export const findSessionUser = async (token: string) => {
  const [rows] = await pool.query<RowDataPacket[]>("SELECT user_id FROM sessions WHERE token_hash = ? AND expires_at > NOW()", [
    hashToken(token),
  ]);
  return rows[0] ? (rows[0].user_id as number) : undefined;
};

export const destroySession = async (token: string) => {
  await pool.query("DELETE FROM sessions WHERE token_hash = ?", [hashToken(token)]);
};

export const clearSessionCookie = (res: Response) => res.clearCookie(SESSION_COOKIE, { path: "/" });
