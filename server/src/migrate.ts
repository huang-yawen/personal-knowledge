import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import mysql from "mysql2/promise";
import { config } from "./config";

const { database, ...connection } = config.mysql;

// 迁移里有多条语句，所以单独开启 multipleStatements
const conn = await mysql.createConnection({
  ...connection,
  multipleStatements: true,
});

// 库不存在时自动创建，方便首次运行
await conn.query(
  `CREATE DATABASE IF NOT EXISTS ${mysql.escapeId(database)} CHARACTER SET utf8mb4`,
);
await conn.query(`USE ${mysql.escapeId(database)}`);
await conn.query(
  "CREATE TABLE IF NOT EXISTS schema_migrations (name VARCHAR(255) PRIMARY KEY, applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)",
);

const [rows] = await conn.query<mysql.RowDataPacket[]>(
  "SELECT name FROM schema_migrations",
);
const applied = new Set(rows.map((row) => row.name as string));

// 按文件名顺序执行尚未应用的迁移
const dir = path.join(import.meta.dirname, "..", "migrations");
const files = (await readdir(dir))
  .filter((file) => file.endsWith(".sql"))
  .sort();

for (const file of files) {
  if (applied.has(file)) continue;
  await conn.query(await readFile(path.join(dir, file), "utf8"));
  await conn.query("INSERT INTO schema_migrations (name) VALUES (?)", [file]);
  console.log(`已应用迁移：${file}`);
}

console.log("迁移完成");
await conn.end();
