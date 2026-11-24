import { readFile } from "node:fs/promises";
import path from "node:path";
import type { RowDataPacket } from "mysql2";
import { pool } from "../src/db";

type Case = {
  id: string;
  type: string;
  question: string;
  relevant: { contains: string }[];
  followupOf?: string;
  goldenAnswer?: string;
};

type Dataset = { version: number; userId?: number; knowledgeBaseIds: number[]; cases: Case[] };

// 校验评估集本身：ID 唯一、followup 指向存在、每条 contains 真的能在某个分块里找到。
// 不依赖 Qdrant / Embedding，改完测集先跑这个，避免把「题写错了」误判成「检索变差」
const main = async () => {
  const dataset = JSON.parse(
    await readFile(path.join(import.meta.dirname, "dataset.json"), "utf8"),
  ) as Dataset;
  const ids = new Set<string>();
  const problems: string[] = [];

  for (const item of dataset.cases) {
    if (ids.has(item.id)) problems.push(`${item.id}: ID 重复`);
    ids.add(item.id);
    if (!item.goldenAnswer) problems.push(`${item.id}: 缺少 goldenAnswer`);
    if (item.type === "negative" && item.relevant.length > 0) problems.push(`${item.id}: negative 不应有 relevant`);
    if (item.type !== "negative" && item.relevant.length === 0) problems.push(`${item.id}: 非 negative 必须至少有一个 relevant`);
    if (item.followupOf && !dataset.cases.some((other) => other.id === item.followupOf)) {
      problems.push(`${item.id}: followupOf 指向不存在的 ${item.followupOf}`);
    }
  }

  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT content FROM document_chunks WHERE user_id = ? AND knowledge_base_id IN (?)",
    [dataset.userId ?? 1, dataset.knowledgeBaseIds],
  );
  const chunks = rows.map((row) => row.content as string);
  console.log(`分块数：${chunks.length}，评估题：${dataset.cases.length} 条`);

  for (const item of dataset.cases) {
    for (const relevant of item.relevant) {
      if (!chunks.some((content) => content.includes(relevant.contains))) {
        problems.push(`${item.id}: 分块里找不到「${relevant.contains}」`);
      }
    }
  }

  if (problems.length > 0) {
    console.error(`\n✗ 发现 ${problems.length} 个问题：`);
    for (const problem of problems) console.error(`  - ${problem}`);
    process.exitCode = 1;
    return;
  }
  console.log("✓ 评估集校验通过");
};

try {
  await main();
} finally {
  await pool.end();
}
