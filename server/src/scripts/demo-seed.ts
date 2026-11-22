import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { config } from "../config";
import { pool } from "../db";
import { hashPassword } from "../modules/auth/password";

// 生成（或重置）演示账号：只读 + 独立的小额度，数据源就是本仓库自己的文档。
// 用法：npm run demo:seed -- <用户名> <密码>
// 文档入库后需要重启一次服务，resumeQueue 会把 pending 的文档排进处理队列。
const username = process.argv[2] ?? "demo";
const password = process.argv[3] ?? "demo-readonly";

if (password.length < 8) {
  console.error("密码至少 8 位");
  process.exit(1);
}

const [existing] = await pool.query<RowDataPacket[]>("SELECT id FROM users WHERE username = ?", [username]);
let userId: number;
if (existing[0]) {
  userId = existing[0].id as number;
  await pool.query("UPDATE users SET password_hash = ?, is_demo = 1 WHERE id = ?", [await hashPassword(password), userId]);
  console.log(`已重置演示账号 ${username}（id=${userId}）`);
} else {
  const [result] = await pool.query<ResultSetHeader>(
    "INSERT INTO users (username, password_hash, display_name, is_admin, is_demo) VALUES (?, ?, ?, 0, 1)",
    [username, await hashPassword(password), "演示账号"],
  );
  userId = result.insertId;
  console.log(`已创建演示账号 ${username}（id=${userId}）`);
}

// 知识库：已有就复用，避免重复创建
const KB_NAME = "示例：这个项目本身";
const [kbs] = await pool.query<RowDataPacket[]>("SELECT id FROM knowledge_bases WHERE user_id = ? AND name = ?", [userId, KB_NAME]);
let knowledgeBaseId: number;
if (kbs[0]) {
  knowledgeBaseId = kbs[0].id as number;
} else {
  const [created] = await pool.query<ResultSetHeader>(
    "INSERT INTO knowledge_bases (user_id, name, description, instructions) VALUES (?, ?, ?, ?)",
    [userId, KB_NAME, "演示用：收录本项目的 README、设计规范与实施计划，可以直接问它「这个项目的检索是怎么做的」。", ""],
  );
  knowledgeBaseId = created.insertId;
  console.log(`已创建知识库：${KB_NAME}（id=${knowledgeBaseId}）`);
}

// 用仓库自己的文档当演示语料：内容公开、和项目相关，面试官问起来正好对得上
const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..", "..");
const SOURCES = ["README.md", "DESIGN.md", "TODO.md"];
const dir = path.join(config.uploadDir, String(userId), String(knowledgeBaseId));
await mkdir(dir, { recursive: true });

for (const name of SOURCES) {
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT id FROM documents WHERE user_id = ? AND knowledge_base_id = ? AND original_name = ?",
    [userId, knowledgeBaseId, name],
  );
  if (rows[0]) {
    console.log(`已存在，跳过：${name}`);
    continue;
  }
  const body = await readFile(path.join(REPO_ROOT, name));
  const stored = path.join(dir, `${randomUUID()}.md`);
  await writeFile(stored, body);
  const [created] = await pool.query<ResultSetHeader>(
    `INSERT INTO documents (user_id, knowledge_base_id, original_name, stored_path, mime_type, size_bytes, status)
     VALUES (?, ?, ?, ?, 'text/markdown', ?, 'pending')`,
    [userId, knowledgeBaseId, name, path.relative(config.uploadDir, stored), body.byteLength],
  );
  console.log(`已加入待处理：${name}（document id=${created.insertId}）`);
}

// 种子数据的文档摘要会消耗这个账号的额度（实测三份文档约 1 万 token）。
// 那是铺垫成本，不该占访客的提问额度，所以清掉今日用量，让计数器从 0 开始
await pool.query("DELETE FROM usage_logs WHERE user_id = ?", [userId]);
console.log("已清零演示账号的用量记录");

console.log("\n下一步：重启一次服务，让队列把 pending 文档切成向量：");
console.log("  systemctl restart personal-knowledge    # 服务器上");
console.log("  （本地开发时 tsx watch 会自动重启；否则手动重启 npm run dev）");
await pool.end();
