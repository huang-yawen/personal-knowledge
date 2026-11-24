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

const CASE_TYPES = ["semantic", "literal", "table", "multi-hop", "followup", "negative"] as const;
type CaseType = (typeof CASE_TYPES)[number];

type Case = {
  id: string;
  type: CaseType | "positive";
  question: string;
  // 判定规则：检索回来的分块正文里是否包含该字符串（用内容特征而不是 chunk id，重新索引后依然有效）
  relevant: { contains: string }[];
  // 追问类：先取这道题的问题原文，拼进检索查询，再检索——顺便验证多轮改写
  followupOf?: string;
  // 标准答案：检索评估不用，留给后续生成层评估
  goldenAnswer?: string;
  note?: string;
};

type Dataset = { version: number; userId?: number; knowledgeBaseIds: number[]; cases: Case[] };

type CaseResult = {
  id: string;
  type: CaseType;
  question: string;
  // 第一条相关分块的名次（1 起），0 表示召回结果里没有
  rank: number;
  // 进入提示词的条数（TOP_K 以内）
  returned: number;
  // 前 TOP_K 条覆盖了几个 relevant 特征；allCovered 主要看 multi-hop
  covered: number;
  allCovered: boolean;
  // 这道题总共有几个 relevant 特征
  relevantCount: number;
  // 最终顺序对应的向量相似度与精排分，用于标定阈值
  scores: number[];
  ms: number;
  stats: RetrievalStats;
  degraded?: string;
};

type TypeSummary = {
  type: CaseType;
  count: number;
  recallAt5: number | null;
  recallAt20: number | null;
  mrr: number | null;
  allCovered: number | null;
  refused: number | null;
  avgMs: number;
};

const normalizeType = (type: Case["type"]): CaseType => (type === "positive" ? "semantic" : type);

const pct = (value: number) => `${(value * 100).toFixed(1)}%`;

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

// 前 TOP_K 条覆盖了几个特征；multi-hop 要求所有特征都出现
const countCovered = (chunks: { content: string }[], features: string[]) =>
  features.filter((feature) => chunks.slice(0, TOP_K).some((chunk) => chunk.content.includes(feature))).length;

const summarize = (results: CaseResult[]) => {
  const ok = results.filter((result) => !result.degraded);
  const answered = ok.filter((result) => result.type !== "negative");
  const negatives = ok.filter((result) => result.type === "negative");
  const hitAt5 = answered.filter((result) => result.rank > 0 && result.rank <= TOP_K).length;
  const hitAt20 = answered.filter((result) => result.rank > 0).length;
  const mrr = answered.reduce((sum, result) => sum + (result.rank > 0 && result.rank <= TOP_K ? 1 / result.rank : 0), 0);
  const refused = negatives.filter((result) => result.returned === 0).length;
  const avgMs = results.reduce((sum, result) => sum + result.ms, 0) / Math.max(results.length, 1);

  const byType: TypeSummary[] = CASE_TYPES.filter((type) => results.some((result) => result.type === type)).map((type) => {
    const group = ok.filter((result) => result.type === type);
    const groupAvgMs = group.reduce((sum, result) => sum + result.ms, 0) / Math.max(group.length, 1);
    if (type === "negative") {
      return {
        type,
        count: group.length,
        recallAt5: null,
        recallAt20: null,
        mrr: null,
        allCovered: null,
        refused: group.filter((result) => result.returned === 0).length,
        avgMs: groupAvgMs,
      };
    }
    const groupHit5 = group.filter((result) => result.rank > 0 && result.rank <= TOP_K).length;
    const groupHit20 = group.filter((result) => result.rank > 0).length;
    const groupMrr = group.reduce((sum, result) => sum + (result.rank > 0 && result.rank <= TOP_K ? 1 / result.rank : 0), 0);
    return {
      type,
      count: group.length,
      recallAt5: groupHit5 / Math.max(group.length, 1),
      recallAt20: groupHit20 / Math.max(group.length, 1),
      mrr: groupMrr / Math.max(group.length, 1),
      allCovered: group.filter((result) => result.allCovered).length,
      refused: null,
      avgMs: groupAvgMs,
    };
  });

  return {
    answered: answered.length,
    negatives: negatives.length,
    recallAt5: hitAt5 / Math.max(answered.length, 1),
    recallAt20: hitAt20 / Math.max(answered.length, 1),
    mrr: mrr / Math.max(answered.length, 1),
    refused,
    refusalRate: negatives.length > 0 ? refused / negatives.length : null,
    avgMs,
    byType,
  };
};

const main = async () => {
  await preflight();
  const datasetPath = path.join(import.meta.dirname, "dataset.json");
  const dataset = JSON.parse(await readFile(datasetPath, "utf8")) as Dataset;
  const byId = new Map(dataset.cases.map((item) => [item.id, item]));
  const userId = dataset.userId ?? config.legacyUserId;
  const typeFilter = process.argv.find((arg) => arg.startsWith("--type="))?.slice("--type=".length);
  const cases = typeFilter ? dataset.cases.filter((item) => normalizeType(item.type) === typeFilter) : dataset.cases;
  const writeBaseline = process.argv.includes("--write-baseline");
  const check = process.argv.includes("--check");

  console.log(`评估集 v${dataset.version}：${cases.length} 条，知识库 ${dataset.knowledgeBaseIds.join(", ")}，用户 ${userId}`);
  console.log(`每道题召回 ${RECALL_LIMIT} 条，截断到前 ${TOP_K} 条作为「进入提示词」的结果`);
  console.log(`精排：${config.rerank.enabled ? `开启${config.rerank.shadow ? "（影子模式，结果仍用向量排序）" : ""}` : "关闭"}；混合检索：${config.retrieval.hybrid.enabled ? "开启" : "关闭"}`);
  if (typeFilter) console.log(`只跑题型：${typeFilter}`);
  console.log("");

  const results: CaseResult[] = [];
  for (const item of cases) {
    const type = normalizeType(item.type);
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
        type,
        question: item.question,
        rank: 0,
        returned: 0,
        covered: 0,
        allCovered: false,
        relevantCount: item.relevant.length,
        scores: [],
        ms: Date.now() - startedAt,
        stats,
        degraded: error instanceof Error ? error.message : String(error),
      });
      continue;
    }

    const covered = type === "negative" ? 0 : countCovered(chunks, item.relevant.map((relevant) => relevant.contains));
    results.push({
      id: item.id,
      type,
      question: item.question,
      rank: type === "negative" ? 0 : findRank(chunks, item.relevant.map((relevant) => relevant.contains)),
      returned: Math.min(chunks.length, TOP_K),
      covered,
      allCovered: type !== "negative" && covered === item.relevant.length,
      relevantCount: item.relevant.length,
      scores: chunks.map((chunk) => Number(chunk.score.toFixed(3))),
      ms: Date.now() - startedAt,
      stats,
    });
  }

  // 逐题明细
  console.log(`${pad("id", 5)}${pad("类型", 12)}${pad("名次", 6)}${pad("进入", 6)}${pad("召回", 6)}${pad("覆盖", 6)}${pad("命中", 6)}${pad("耗时", 8)}问题`);
  for (const result of results) {
    const mark =
      result.type === "negative"
        ? result.returned === 0
          ? "拒答"
          : "误召回"
        : result.rank > 0
          ? `#${result.rank}`
          : "未命中";
    console.log(
      `${pad(result.id, 5)}${pad(result.type, 12)}${pad(result.rank || "-", 6)}${pad(result.returned, 6)}${pad(result.stats.candidates, 6)}${pad(`${result.covered}/${result.relevantCount}`, 6)}${pad(mark, 6)}${pad(`${result.ms}ms`, 8)}${result.question}`,
    );
    if (result.degraded) console.log(`      ⚠ ${result.degraded}`);
  }

  const summary = summarize(results);
  const failed = results.filter((result) => result.degraded);

  console.log("\n=== 分题型 ===");
  console.log(
    `${pad("题型", 10)}${pad("条数", 6)}${pad("recall@5", 11)}${pad("recall@20", 12)}${pad("MRR@5", 8)}${pad("多证据", 8)}${pad("拒答", 8)}${pad("耗时", 8)}`,
  );
  for (const row of summary.byType) {
    console.log(
      `${pad(row.type, 10)}${pad(row.count, 6)}${pad(row.recallAt5 === null ? "-" : pct(row.recallAt5), 11)}${pad(row.recallAt20 === null ? "-" : pct(row.recallAt20), 12)}${pad(row.mrr === null ? "-" : row.mrr.toFixed(3), 8)}${pad(row.allCovered === null ? "-" : `${row.allCovered}/${row.count}`, 8)}${pad(row.refused === null ? "-" : `${row.refused}/${row.count}`, 8)}${pad(`${Math.round(row.avgMs)}ms`, 8)}`,
    );
  }

  console.log("\n=== 汇总 ===");
  if (failed.length > 0) {
    console.log(`⚠ 出错 ${failed.length} 条，已从指标中排除：${failed.map((result) => result.id).join(", ")}`);
  }
  console.log(`有答案的题：${summary.answered} 条`);
  console.log(`  recall@${TOP_K}      ${pct(summary.recallAt5)}   ← 前 ${TOP_K} 条里能命中的比例`);
  console.log(`  recall@${RECALL_LIMIT}     ${pct(summary.recallAt20)}   ← 召回池里能命中的比例（与上一行差距越大，说明排序越差，rerank 越有用）`);
  console.log(`  MRR@${TOP_K}         ${summary.mrr.toFixed(3)}`);
  console.log(`  multi-hop 全证据覆盖 ${summary.byType.find((row) => row.type === "multi-hop")?.allCovered ?? 0}/${summary.byType.find((row) => row.type === "multi-hop")?.count ?? 0}`);
  console.log(`库里没有的题：${summary.negatives} 条`);
  console.log(`  正确拒答        ${summary.refused}/${summary.negatives} = ${summary.refusalRate === null ? "-" : pct(summary.refusalRate)}   ← 阈值是否过松；误召回就是幻觉的源头`);
  console.log(`平均耗时：${summary.avgMs.toFixed(0)}ms`);

  const baselinePath = path.join(import.meta.dirname, "baseline.json");
  const baseline = {
    datasetVersion: dataset.version,
    createdAt: new Date().toISOString(),
    config: {
      minScore: config.retrieval.minScore,
      rerank: config.rerank.enabled,
      rerankShadow: config.rerank.shadow,
      rerankMinScore: config.rerank.minScore ?? null,
      hybrid: config.retrieval.hybrid.enabled,
      embeddingModel: config.embedding.model,
      topK: TOP_K,
      recallLimit: RECALL_LIMIT,
    },
    overall: {
      answered: summary.answered,
      recallAt5: summary.recallAt5,
      recallAt20: summary.recallAt20,
      mrr: summary.mrr,
      refusalRate: summary.refusalRate,
      avgMs: summary.avgMs,
    },
    byType: summary.byType,
  };

  if (writeBaseline) {
    await writeFile(baselinePath, `${JSON.stringify(baseline, null, 2)}\n`);
    console.log(`\n基线已写入：${path.relative(process.cwd(), baselinePath)}`);
  } else if (typeFilter) {
    console.log("\n指定了题型过滤，跳过基线对比");
  } else {
    try {
      const previous = JSON.parse(await readFile(baselinePath, "utf8")) as typeof baseline;
      if (previous.datasetVersion !== dataset.version) {
        console.log(`\n基线版本是 v${previous.datasetVersion}，与当前 v${dataset.version} 不同，跳过对比`);
      } else {
        // 配置变了（例如打开精排），指标本身就会变，只提示差异，不当作回归
        const configChanged =
          previous.config.rerank !== baseline.config.rerank ||
          previous.config.hybrid !== baseline.config.hybrid ||
          previous.config.minScore !== baseline.config.minScore;
        const delta = (current: number, before: number) => `${current - before >= 0 ? "+" : ""}${((current - before) * 100).toFixed(1)}pt`;
        console.log("\n=== 对比基线 ===");
        if (configChanged) console.log("⚠ 基线配置与当前不同，对比仅供参考");
        console.log(`recall@5  ${pct(summary.recallAt5)}（${delta(summary.recallAt5, previous.overall.recallAt5)}）`);
        console.log(`MRR@5     ${summary.mrr.toFixed(3)}（${delta(summary.mrr, previous.overall.mrr)}）`);
        console.log(`拒答率    ${summary.refusalRate === null ? "-" : pct(summary.refusalRate)}（${previous.overall.refusalRate === null ? "基线无" : delta(summary.refusalRate ?? 0, previous.overall.refusalRate)}）`);
        if (check && !configChanged && summary.recallAt5 < previous.overall.recallAt5 - 0.02) {
          console.error("✗ recall@5 比基线下降超过 2pt");
          process.exitCode = 1;
        }
        if (check && !configChanged && previous.overall.refusalRate !== null && (summary.refusalRate ?? 0) < previous.overall.refusalRate - 0.1) {
          console.error("✗ 拒答率比基线下降超过 10pt");
          process.exitCode = 1;
        }
      }
    } catch {
      console.log("\n没有基线文件；加 --write-baseline 生成一份");
    }
  }

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
        summary,
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
