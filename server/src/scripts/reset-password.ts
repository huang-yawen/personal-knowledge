import type { RowDataPacket } from "mysql2";
import { pool } from "../db";
import { hashPassword, MAX_PASSWORD_CHARS, MIN_PASSWORD_CHARS } from "../modules/auth/password";

// 重置某个用户的密码：npm run reset-password -- <用户名> <新密码>
// 没有邮件找回功能，忘记密码时由服务器管理员用这个脚本重置，同时让该用户已有的登录全部失效
const [username, newPassword] = process.argv.slice(2);
if (!username || !newPassword || newPassword.length < MIN_PASSWORD_CHARS || newPassword.length > MAX_PASSWORD_CHARS) {
  console.error(`用法：npm run reset-password -- <用户名> <新密码（${MIN_PASSWORD_CHARS} 到 ${MAX_PASSWORD_CHARS} 位）>`);
  process.exitCode = 1;
} else {
  const [rows] = await pool.query<RowDataPacket[]>("SELECT id FROM users WHERE username = ?", [username]);
  if (!rows[0]) {
    console.error(`用户不存在：${username}`);
    process.exitCode = 1;
  } else {
    await pool.query("UPDATE users SET password_hash = ? WHERE id = ?", [await hashPassword(newPassword), rows[0].id]);
    await pool.query("DELETE FROM sessions WHERE user_id = ?", [rows[0].id]);
    console.log(`已重置 ${username} 的密码，并使其已有登录失效`);
  }
}
await pool.end();
