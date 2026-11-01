import { randomBytes } from "node:crypto";
import { Router, type RequestHandler } from "express";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { pool } from "../../db";
import { currentUserId } from "../auth/context";
import { hashPassword, MAX_PASSWORD_CHARS, MIN_PASSWORD_CHARS } from "../auth/password";
import { parseId } from "../knowledge-base/routes";

// 每次都查库确认管理员身份，不依赖会话里缓存的信息
const requireAdmin: RequestHandler = async (_req, res, next) => {
  const [rows] = await pool.query<RowDataPacket[]>("SELECT is_admin FROM users WHERE id = ?", [currentUserId()]);
  if (!rows[0]?.is_admin) {
    res.status(403).json({ error: "需要管理员权限" });
    return;
  }
  next();
};

export const adminRouter = Router();
adminRouter.use(requireAdmin);

// 邀请码：最近 100 个，含使用情况
adminRouter.get("/invites", async (_req, res) => {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT i.code, i.created_at AS createdAt, i.used_at AS usedAt, u.username AS usedBy
     FROM invite_codes i LEFT JOIN users u ON u.id = i.used_by
     ORDER BY i.created_at DESC, i.code LIMIT 100`,
  );
  res.json(rows);
});

adminRouter.post("/invites", async (_req, res) => {
  const code = randomBytes(9).toString("base64url");
  await pool.query("INSERT INTO invite_codes (code) VALUES (?)", [code]);
  res.status(201).json({ code });
});

// 只能删除还没被使用的邀请码
adminRouter.delete("/invites/:code", async (req, res) => {
  const [result] = await pool.query<ResultSetHeader>("DELETE FROM invite_codes WHERE code = ? AND used_by IS NULL", [req.params.code]);
  if (result.affectedRows === 0) {
    res.status(404).json({ error: "邀请码不存在或已被使用" });
    return;
  }
  res.status(204).end();
});

// 用户列表及用量（不含任何密码信息）
adminRouter.get("/users", async (_req, res) => {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT u.id, u.username, u.display_name AS displayName, u.is_admin AS isAdmin, u.created_at AS createdAt,
       (SELECT COUNT(*) FROM documents WHERE user_id = u.id) AS documents,
       (SELECT COUNT(*) FROM notes WHERE user_id = u.id) AS notes,
       (SELECT COUNT(*) FROM conversations WHERE user_id = u.id) AS conversations,
       (SELECT COALESCE(SUM(tokens), 0) FROM usage_logs WHERE user_id = u.id AND created_at >= CURDATE()) AS tokensToday,
       (SELECT COALESCE(SUM(tokens), 0) FROM usage_logs WHERE user_id = u.id) AS tokensTotal
     FROM users u ORDER BY u.id`,
  );
  res.json(
    rows.map((row) => ({
      ...row,
      isAdmin: Boolean(row.isAdmin),
      documents: Number(row.documents),
      notes: Number(row.notes),
      conversations: Number(row.conversations),
      tokensToday: Number(row.tokensToday),
      tokensTotal: Number(row.tokensTotal),
    })),
  );
});

// 重置用户密码（用户忘记密码时用）：同时让该用户已有的登录失效
adminRouter.post("/users/:id/password", async (req, res) => {
  const id = parseId(req.params.id);
  const newPassword = typeof req.body?.newPassword === "string" ? (req.body.newPassword as string) : "";
  if (newPassword.length < MIN_PASSWORD_CHARS || newPassword.length > MAX_PASSWORD_CHARS) {
    res.status(400).json({ error: `新密码长度需为 ${MIN_PASSWORD_CHARS} 到 ${MAX_PASSWORD_CHARS} 位` });
    return;
  }
  const [result] = id
    ? await pool.query<ResultSetHeader>("UPDATE users SET password_hash = ? WHERE id = ?", [await hashPassword(newPassword), id])
    : [undefined];
  if (!id || !result || result.affectedRows === 0) {
    res.status(404).json({ error: "用户不存在" });
    return;
  }
  await pool.query("DELETE FROM sessions WHERE user_id = ?", [id]);
  res.status(204).end();
});
