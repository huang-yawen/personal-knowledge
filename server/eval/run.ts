import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { config } from "../src/config";
import { pool } from "../src/db";
import { runAsUser } from "../src/modules/auth/context";
import { buildRetrievalQuery } from "../src/modules/rag/query";
import { emptyRetrievalStats, retrieveChunks, type RetrievalStats } from "../src/modules/rag/retrieve";

// 一次召回到 20 条再截断，用来区分两类问题：
//   相关片段在 20 条内但不在前 5 条 → 排序问题，rerank 能救
//   20 条内也没有                    → 召回问题，rerank 救不了
const RECALL_LIMIT = 20;
const TOP_K = 5;

type Case = {
  id: string;
  type: "positive" | "followup" | "negative";
  question: string;
  // 判定规则：检索回来的分块正文里是否包含该字符串（用内容特征而不是 chunk id，重新索引后依然有效）
  relevant: { contains: string }[];
  // 追问类：先取这道题的问题原文，拼进检索查询，再检索——顺便验证多轮改写
  followupOf?: string;
  note?: string;
};

type Dataset = { version: number; knowledgeBaseIds: number[]; cases: Case[] };

type CaseResult = {
  id: string;
  type: Case["type"];
  question: string;
  // 第一条相关分块的名次（1 起），0 表示召回结果里没有
  rank: number;
  // 进入提示词的条数（TOP_K 以内）
  returned: number;
  ms: number;
  stats: RetrievalStats;
  degraded?: string;
};

const pad = (value: unknown, width: number) => String(value).padEnd(width);

// 预检：Qdrant 不通时直接退出。否则每个用例都会失败，还会被误算成「未命中」或「正确拒答」
const preflight = async () => {
  try {
    const response = await fetch(`${config.qdrant.url}/collections/${config.qdrant.collection}`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok && response.status !== 404) throw new Error(`HTTP ${response.status}`);
  } catch (error) {
    console.error(`✗ Qdrant 不可用（${config.qdrant.url}）：${error instanceof Error ? error.message : String(error)}`);
    console.error("  评估需要向量库。请先启动 Qdrant（例如 Docker Desktop + qdrant 容器）再重试。");
    process.exit(1);
  }
};

// 在检索结果里找第一条命中任一特征串的分块，返回 1 起的名次，找不到返回 0
const findRank = (chunks: { content: string }[], features: string[]) => {
  const index = chunks.findIndex((chunk) => features.some((feature) => chunk.content.includes(feature)));
  return index < 0 ? 0 : index + 1;
};

const main = async () => {
  await preflight();
  const datasetPath = path.join(import.meta.dirname, "dataset.json");
  const dataset = JSON.parse(await readFile(datasetPath, "utf8")) as Dataset;
  const byId = new Map(dataset.cases.map((item) => [item.id, item]));
  const userId = config.legacyUserId;

  console.log(`评估集：${dataset.cases.length} 条，知识库 ${dataset.knowledgeBaseIds.join(", ")}，用户 ${userId}`);
  console.log(`每道题召回 ${RECALL_LIMIT} 条，截断到前 ${TOP_K} 条作为「进入提示词」的结果`);
  console.log(`精排：${config.rerank.enabled ? `开启${config.rerank.shadow ? "（影子模式，结果仍用向量排序）" : ""}` : "关闭"}\n`);

  const results: CaseResult[] = [];
  for (const item of dataset.cases) {
    // 追问：把上一轮问题拼进检索查询（与线上 buildRetrievalQuery 同一套逻辑）
    const previous = item.followupOf ? byId.get(item.followupOf) : undefined;
    const query = previous
      ? buildRetrievalQuery(item.question, [{ role: "user", content: previous.question }])
      : item.question;

    const stats: RetrievalStats = emptyRetrievalStats();
    const startedAt = Date.now();
    let chunks: { content: string }[] = [];
    try {
      chunks = await runAsUser(userId, () =>
        retrieveChunks(query, { knowledgeBaseIds: dataset.knowledgeBaseIds, limit: RECALL_LIMIT, stats }),
      );
    } catch (error) {
      results.push({
        id: item.id,
        type: item.type,
        question: item.question,
        rank: 0,
        returned: 0,
        ms: Date.now() - startedAt,
        stats,
        degraded: error instanceof Error ? error.message : String(error),
      });
      continue;
    }

    results.push({
      id: item.id,
      type: item.type,
      question: item.question,
      rank: item.type === "negative" ? 0 : findRank(chunks, item.relevant.map((r) => r.contains)),
      returned: Math.min(chunks.length, TOP_K),
      ms: Date.now() - startedAt,
      stats,
    });
  }

  // 逐题明细
  console.log(`${pad("id", 5)}${pad("类型", 10)}${pad("名次", 6)}${pad("进入", 6)}${pad("召回", 6)}${pad("命中", 6)}${pad("耗时", 8)}问题`);
  for (const r of results) {
    const mark = r.type === "negative" ? (r.returned === 0 ? "拒答" : "误召回") : r.rank > 0 ? `#${r.rank}` : "未命中";
    console.log(
      `${pad(r.id, 5)}${pad(r.type, 10)}${pad(r.rank || "-", 6)}${pad(r.returned, 6)}${pad(r.stats.candidates, 6)}${pad(mark, 6)}${pad(`${r.ms}ms`, 8)}${r.question}`,
    );
    if (r.degraded) console.log(`      ⚠ ${r.degraded}`);
  }

  // 汇总：出错的用例不计入任何指标，单独统计
  const ok = results.filter((r) => !r.degraded);
  const failed = results.filter((r) => r.degraded);
  const answered = ok.filter((r) => r.type !== "negative");
  const negatives = ok.filter((r) => r.type === "negative");
  const hitAt5 = answered.filter((r) => r.rank > 0 && r.rank <= TOP_K).length;
  const hitAt20 = answered.filter((r) => r.rank > 0).length;
  const mrr = answered.reduce((sum, r) => sum + (r.rank > 0 && r.rank <= TOP_K ? 1 / r.rank : 0), 0);
  const rejected = negatives.filter((r) => r.returned === 0).length;

  console.log("\n=== 汇总 ===");
  if (failed.length > 0) {
    console.log(`⚠ 出错 ${failed.length} 条，已从指标中排除：${failed.map((r) => r.id).join(", ")}`);
  }
  console.log(`有答案的题：${answered.length} 条`);
  console.log(`  recall@${TOP_K}      ${hitAt5}/${answered.length} = ${((hitAt5 / Math.max(answered.length, 1)) * 100).toFixed(1)}%   ← 前 ${TOP_K} 条里能命中的比例`);
  console.log(`  recall@${RECALL_LIMIT}     ${hitAt20}/${answered.length} = ${((hitAt20 / Math.max(answered.length, 1)) * 100).toFixed(1)}%   ← 召回池里能命中的比例（与上一行差距越大，说明排序越差，rerank 越有用）`);
  console.log(`  MRR@${TOP_K}         ${(mrr / Math.max(answered.length, 1)).toFixed(3)}`);
  console.log(`库里没有的题：${negatives.length} 条`);
  console.log(`  正确拒答        ${rejected}/${negatives.length}   ← 阈值是否过松；误召回就是幻觉的源头`);
  console.log(`平均耗时：${(results.reduce((sum, r) => sum + r.ms, 0) / Math.max(results.length, 1)).toFixed(0)}ms`);

  // 保存报告，便于和开启 rerank 之后的结果对比
  const reportDir = path.join(import.meta.dirname, "reports");
  await mkdir(reportDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const reportPath = path.join(reportDir, `report-${stamp}.json`);
  await writeFile(
    reportPath,
    JSON.stringify(
      {
        datasetVersion: dataset.version,
        recallLimit: RECALL_LIMIT,
        topK: TOP_K,
        minScore: config.retrieval.minScore,
        rerank: config.rerank.enabled,
        rerankShadow: config.rerank.shadow,
        rerankMinScore: config.rerank.minScore ?? null,
        results,
      },
      null,
      2,
    ),
  );
  console.log(`\n报告已保存：${path.relative(process.cwd(), reportPath)}`);
};

try {
  await main();
} finally {
  // 连接池会一直占着事件循环，不主动关闭进程跑完也不退出
  await pool.end();
}
