import assert from "node:assert/strict";
import { test } from "node:test";
import type { RetrievedChunk } from "./retrieve";

// config 在导入时校验必填环境变量，这里给测试用的假值；连接池是惰性的，不会真的连数据库
Object.assign(process.env, {
  EMBEDDING_API_KEY: "x",
  EMBEDDING_BASE_URL: "http://localhost",
  EMBEDDING_MODEL: "x",
  EMBEDDING_DIMENSIONS: "1024",
  DEEPSEEK_API_KEY: "x",
  DEEPSEEK_BASE_URL: "http://localhost",
  DEEPSEEK_MODEL: "x",
  QDRANT_URL: "http://localhost:6333",
  MYSQL_USER: "x",
  MYSQL_DATABASE: "x",
});
const { applyRerankResults, rerankChunks } = await import("./rerank");

const chunk = (i: number, content = `分块${i}`): RetrievedChunk => ({
  chunkId: i,
  knowledgeBaseId: 1,
  documentId: 1,
  documentName: `文档${i}.md`,
  page: null,
  content,
  score: 0.5,
});

// 假的 fetch：返回固定 JSON
const stubFetch = (payload: unknown, status = 200) => async () =>
  new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });

const chunks = [chunk(0), chunk(1), chunk(2), chunk(3)];

test("按接口返回的下标映射回原分块，并按分数降序", () => {
  const result = applyRerankResults(chunks, [
    { index: 2, relevance_score: 0.31 },
    { index: 0, relevance_score: 0.92 },
    { index: 3, relevance_score: 0.55 },
  ]);
  assert.deepEqual(
    result.map((item) => [item.chunkId, item.rerankScore]),
    [
      [0, 0.92],
      [3, 0.55],
      [2, 0.31],
    ],
  );
  // 其余字段原样保留
  assert.equal(result[0].documentName, "文档0.md");
});

test("越界的下标被丢弃，不会张冠李戴", () => {
  const result = applyRerankResults(chunks, [
    { index: 4, relevance_score: 0.9 },
    { index: -1, relevance_score: 0.8 },
    { index: 1, relevance_score: 0.7 },
  ]);
  assert.deepEqual(
    result.map((item) => item.chunkId),
    [1],
  );
});

test("重复的下标只取第一次，非整数下标被丢弃", () => {
  const result = applyRerankResults(chunks, [
    { index: 1, relevance_score: 0.9 },
    { index: 1, relevance_score: 0.1 },
    { index: 1.5, relevance_score: 0.8 },
    { index: 2, relevance_score: 0.6 },
  ]);
  assert.deepEqual(
    result.map((item) => item.chunkId),
    [1, 2],
  );
});

test("分数不是有效数字时丢弃该条", () => {
  const result = applyRerankResults(chunks, [
    { index: 0, relevance_score: Number.NaN },
    { index: 1, relevance_score: 0.5 },
  ]);
  assert.deepEqual(
    result.map((item) => item.chunkId),
    [1],
  );
});

test("minScore 过滤，未设置时不过滤", () => {
  const results = [
    { index: 0, relevance_score: 0.9 },
    { index: 1, relevance_score: 0.5 },
    { index: 2, relevance_score: -1.2 },
  ];
  assert.equal(applyRerankResults(chunks, results).length, 3);
  // rerank 分数可能是负数（logit），所以阈值允许负数
  assert.deepEqual(
    applyRerankResults(chunks, results, { minScore: 0.6 }).map((item) => item.chunkId),
    [0],
  );
  assert.equal(applyRerankResults(chunks, results, { minScore: -2 }).length, 3);
  assert.equal(applyRerankResults(chunks, results, { minScore: 10 }).length, 0);
});

test("limit 截断", () => {
  const results = [
    { index: 0, relevance_score: 0.9 },
    { index: 1, relevance_score: 0.8 },
    { index: 2, relevance_score: 0.7 },
  ];
  assert.deepEqual(
    applyRerankResults(chunks, results, { limit: 2 }).map((item) => item.chunkId),
    [0, 1],
  );
});

test("空结果返回空数组", () => {
  assert.deepEqual(applyRerankResults(chunks, []), []);
});

test("未开启时不调用接口", async () => {
  assert.equal(await rerankChunks("问题", chunks, { enabled: false }), null);
});

test("只有一条候选时不调用接口", async () => {
  assert.equal(await rerankChunks("问题", [chunk(0)], { enabled: true }), null);
});

test("接口报错时降级（返回 null），不抛异常", async () => {
  const result = await rerankChunks("问题", chunks, {
    enabled: true,
    fetchImpl: stubFetch({ error: "boom" }, 500),
  });
  assert.equal(result, null);
});

test("网络异常时降级（返回 null）", async () => {
  const result = await rerankChunks("问题", chunks, {
    enabled: true,
    fetchImpl: async () => {
      throw new Error("ECONNREFUSED");
    },
  });
  assert.equal(result, null);
});

test("返回空 results 时降级（返回 null），与「全部不相关」区分开", async () => {
  const result = await rerankChunks("问题", chunks, { enabled: true, fetchImpl: stubFetch({ results: [] }) });
  assert.equal(result, null);
});

test("成功时返回数组而不是 null，与降级区分开", async () => {
  const result = await rerankChunks("问题", chunks, {
    enabled: true,
    fetchImpl: stubFetch({ results: [{ index: 0, relevance_score: -9 }] }),
  });
  // 分数很低但阈值未配置（RERANK_MIN_SCORE 未设置）时仍返回，阈值过滤见 applyRerankResults 的用例
  assert.ok(Array.isArray(result));
  assert.equal(result.length, 1);
});

test("正常返回并排序，top_n 与 limit 一致", async () => {
  let received: { top_n?: number } = {};
  const result = await rerankChunks("问题", chunks, {
    enabled: true,
    limit: 2,
    fetchImpl: async (_url, init) => {
      received = JSON.parse(String(init?.body)) as { top_n?: number };
      return new Response(
        JSON.stringify({
          results: [
            { index: 3, relevance_score: 0.2 },
            { index: 1, relevance_score: 0.9 },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    },
  });
  assert.equal(received.top_n, 2);
  assert.deepEqual(
    result?.map((item) => item.chunkId),
    [1, 3],
  );
});
