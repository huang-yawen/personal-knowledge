import { Router } from "express";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { config } from "../../config";
import { pool } from "../../db";
import { requireAuth } from "./middleware";
import { currentUserId } from "./context";
import { hashPassword, MAX_PASSWORD_CHARS, MIN_PASSWORD_CHARS, spendDummyVerification, verifyPassword } from "./password";
import { clearFailures, isBlocked, recordFailure } from "./rate-limit";
import { clearSessionCookie, createSession, destroySession, readSessionToken } from "./session";

const USERNAME_PATTERN = /^[A-Za-z0-9_]{3,32}$/;

const toUser = (row: RowDataPacket) => ({
  id: row.id as number,
  username: row.username as string,
  displayName: row.display_name as string,
  isAdmin: Boolean(row.is_admin),
});

const asBody = (value: unknown) => (typeof value === "object" && value !== null ? value : {}) as Record<string, unknown>;

export const authRouter = Router();

// 注册：必须持有未使用的邀请码；第一个注册的账号成为管理员，并沿用原来固定用户的 id，从而自动接管已有数据
authRouter.post("/register", async (req, res) => {
  const body = asBody(req.body);
  const username = typeof body.username === "string" ? body.username.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const inviteCode = typeof body.inviteCode === "string" ? body.inviteCode.trim() : "";
  const displayName = (typeof body.displayName === "string" ? body.displayName.trim() : "") || username;

  // 按 IP 限制尝试次数，防止暴力猜邀请码
  const guardKey = `register|${req.ip}`;
  if (isBlocked(guardKey)) {
    res.status(429).json({ error: "尝试次数过多，请 15 分钟后再试" });
    return;
  }
  if (!USERNAME_PATTERN.test(username)) {
    res.status(400).json({ error: "用户名为 3 到 32 位字母、数字或下划线" });
    return;
  }
  if (password.length < MIN_PASSWORD_CHARS || password.length > MAX_PASSWORD_CHARS) {
    res.status(400).json({ error: `密码长度需为 ${MIN_PASSWORD_CHARS} 到 ${MAX_PASSWORD_CHARS} 位` });
    return;
  }
  if (Array.from(displayName).length > 50) {
    res.status(400).json({ error: "显示名称不超过 50 个字符" });
    return;
  }

  const passwordHash = await hashPassword(password);
  const conn = await pool.getConnection();
  let userId: number | undefined;
  let failure: { status: number; message: string } | undefined;
  try {
    await conn.beginTransaction();
    const [codes] = await conn.query<RowDataPacket[]>("SELECT code FROM invite_codes WHERE code = ? AND used_by IS NULL FOR UPDATE", [
      inviteCode,
    ]);
    if (codes.length === 0) {
      failure = { status: 403, message: "邀请码无效或已被使用" };
    } else {
      const [taken] = await conn.query<RowDataPacket[]>("SELECT id FROM users WHERE username = ?", [username]);
      const [count] = await conn.query<RowDataPacket[]>("SELECT COUNT(*) AS total FROM users");
      if (taken.length > 0) {
        failure = { status: 409, message: "用户名已被占用" };
      } else {
        const isFirst = Number(count[0].total) === 0;
        const [result] = await conn.query<ResultSetHeader>(
          isFirst
            ? "INSERT INTO users (id, username, password_hash, display_name, is_admin) VALUES (?, ?, ?, ?, 1)"
            : "INSERT INTO users (username, password_hash, display_name, is_admin) VALUES (?, ?, ?, 0)",
          isFirst ? [config.legacyUserId, username, passwordHash, displayName] : [username, passwordHash, displayName],
        );
        userId = isFirst ? config.legacyUserId : result.insertId;
        await conn.query("UPDATE invite_codes SET used_by = ?, used_at = NOW() WHERE code = ?", [userId, inviteCode]);
      }
    }
    if (failure) await conn.rollback();
    else await conn.commit();
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
  if (failure || userId === undefined) {
    // 邀请码错误才计入失败次数
    if (failure?.status === 403) recordFailure(guardKey);
    res.status(failure?.status ?? 500).json({ error: failure?.message ?? "注册失败" });
    return;
  }
  clearFailures(guardKey);
  await createSession(userId, req, res);
  const [rows] = await pool.query<RowDataPacket[]>("SELECT id, username, display_name, is_admin FROM users WHERE id = ?", [userId]);
  res.status(201).json(toUser(rows[0]));
});

// 登录：按“IP + 用户名”限制连续失败次数；用户名或密码错误时给同样的提示，不暴露用户是否存在
authRouter.post("/login", async (req, res) => {
  const body = asBody(req.body);
  const username = typeof body.username === "string" ? body.username.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const guardKey = `login|${req.ip}|${username.toLowerCase()}`;
  if (isBlocked(guardKey)) {
    res.status(429).json({ error: "失败次数过多，请 15 分钟后再试" });
    return;
  }
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT id, username, password_hash, display_name, is_admin FROM users WHERE username = ?",
    [username],
  );
  const valid =
    password.length <= MAX_PASSWORD_CHARS &&
    (rows[0] ? await verifyPassword(password, rows[0].password_hash as string) : (await spendDummyVerification(password), false));
  if (!valid) {
    recordFailure(guardKey);
    res.status(401).json({ error: "用户名或密码错误" });
    return;
  }
  clearFailures(guardKey);
  await createSession(rows[0].id as number, req, res);
  res.json(toUser(rows[0]));
});

authRouter.post("/logout", async (req, res) => {
  const token = readSessionToken(req);
  if (token) await destroySession(token);
  clearSessionCookie(res);
  res.status(204).end();
});

authRouter.get("/me", requireAuth, async (_req, res) => {
  const [rows] = await pool.query<RowDataPacket[]>("SELECT id, username, display_name, is_admin FROM users WHERE id = ?", [
    currentUserId(),
  ]);
  if (!rows[0]) {
    res.status(401).json({ error: "请先登录" });
    return;
  }
  res.json(toUser(rows[0]));
});

// 修改显示名称
authRouter.patch("/me", requireAuth, async (req, res) => {
  const displayName = typeof asBody(req.body).displayName === "string" ? (asBody(req.body).displayName as string).trim() : "";
  if (!displayName || Array.from(displayName).length > 50) {
    res.status(400).json({ error: "显示名称不能为空，且不超过 50 个字符" });
    return;
  }
  await pool.query("UPDATE users SET display_name = ? WHERE id = ?", [displayName, currentUserId()]);
  const [rows] = await pool.query<RowDataPacket[]>("SELECT id, username, display_name, is_admin FROM users WHERE id = ?", [
    currentUserId(),
  ]);
  res.json(toUser(rows[0]));
});

// 修改密码：需要旧密码；成功后其他设备上的登录全部失效，当前设备保持登录
authRouter.post("/password", requireAuth, async (req, res) => {
  const body = asBody(req.body);
  const oldPassword = typeof body.oldPassword === "string" ? body.oldPassword : "";
  const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";
  if (newPassword.length < MIN_PASSWORD_CHARS || newPassword.length > MAX_PASSWORD_CHARS) {
    res.status(400).json({ error: `新密码长度需为 ${MIN_PASSWORD_CHARS} 到 ${MAX_PASSWORD_CHARS} 位` });
    return;
  }
  const userId = currentUserId();
  const guardKey = `password|${userId}`;
  if (isBlocked(guardKey)) {
    res.status(429).json({ error: "失败次数过多，请 15 分钟后再试" });
    return;
  }
  const [rows] = await pool.query<RowDataPacket[]>("SELECT password_hash FROM users WHERE id = ?", [userId]);
  if (!rows[0] || !(await verifyPassword(oldPassword, rows[0].password_hash as string))) {
    recordFailure(guardKey);
    res.status(403).json({ error: "旧密码不正确" });
    return;
  }
  clearFailures(guardKey);
  await pool.query("UPDATE users SET password_hash = ? WHERE id = ?", [await hashPassword(newPassword), userId]);
  const token = readSessionToken(req);
  await pool.query("DELETE FROM sessions WHERE user_id = ? AND token_hash <> SHA2(?, 256)", [userId, token ?? ""]);
  res.status(204).end();
});
