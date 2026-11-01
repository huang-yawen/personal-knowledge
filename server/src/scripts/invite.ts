import { randomBytes } from "node:crypto";
import { pool } from "../db";

// 生成一个一次性邀请码：npm run invite
const code = randomBytes(9).toString("base64url");
await pool.query("INSERT INTO invite_codes (code) VALUES (?)", [code]);
console.log(`邀请码：${code}`);
await pool.end();
