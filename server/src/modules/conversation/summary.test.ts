import assert from "node:assert/strict";
import { test } from "node:test";

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
const { planSummary } = await import("./summary");
type SummaryMessage = import("./summary").SummaryMessage;

const messages = (count: number): SummaryMessage[] =>
  Array.from({ length: count }, (_, index) => ({
    id: index + 1,
    role: index % 2 === 0 ? "user" : "assistant",
    content: `第 ${index + 1} 条`,
  }));

const options = { window: 10, minMessages: 6, hasSummary: false };

test("消息没超出窗口时不需要摘要", () => {
  assert.equal(planSummary(messages(10), options), null);
  assert.equal(planSummary(messages(3), options), null);
  assert.equal(planSummary([], options), null);
});

test("首次没有摘要时，窗口之前的部分全部压缩", () => {
  const plan = planSummary(messages(13), options);
  assert.ok(plan);
  // 13 条、窗口 10 → 前面 3 条
  assert.equal(plan.messages.length, 3);
  assert.equal(plan.messages[0].id, 1);
  assert.equal(plan.untilId, 3);
});

test("已有摘要时，新增不足 minMessages 先跳过", () => {
  // 12 条、窗口 10 → 新增 2 条，少于 6
  assert.equal(planSummary(messages(12), { ...options, hasSummary: true }), null);
});

test("已有摘要且累积够了才重新总结", () => {
  // 17 条、窗口 10 → 新增 7 条，达到 6
  const plan = planSummary(messages(17), { ...options, hasSummary: true });
  assert.ok(plan);
  assert.equal(plan.messages.length, 7);
  assert.equal(plan.untilId, 7);
});

test("游标只覆盖窗口之前的消息，最近窗口内的一条都不碰", () => {
  const plan = planSummary(messages(25), { window: 10, minMessages: 6, hasSummary: true });
  assert.ok(plan);
  // 25 - 10 = 15
  assert.equal(plan.messages.length, 15);
  assert.equal(plan.untilId, 15);
  assert.ok(plan.messages.every((message) => message.id <= 15));
});
