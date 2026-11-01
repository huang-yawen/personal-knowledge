import assert from "node:assert/strict";
import { test } from "node:test";
import type { Request, Response } from "express";

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
const { runAsUser } = await import("../auth/context");
const { estimateTokens, userRateLimit } = await import("./index");

// 返回 [是否放行, 状态码, Retry-After]
const hit = (limit: ReturnType<typeof userRateLimit>, userId: number) =>
  runAsUser(userId, () => {
    let passed = false;
    let status = 200;
    let retryAfter: unknown;
    const res = {
      setHeader: (_name: string, value: unknown) => ((retryAfter = value), res),
      status: (code: number) => ((status = code), res),
      json: () => res,
    } as unknown as Response;
    limit({} as Request, res, () => (passed = true));
    return { passed, status, retryAfter };
  });

test("超过上限后返回 429 并带 Retry-After，未超过时放行", () => {
  const limit = userRateLimit("t1", 3);
  for (let i = 0; i < 3; i++) assert.equal(hit(limit, 1).passed, true);
  const blocked = hit(limit, 1);
  assert.equal(blocked.passed, false);
  assert.equal(blocked.status, 429);
  assert.ok(Number(blocked.retryAfter) > 0);
});

test("按用户独立计数", () => {
  const limit = userRateLimit("t2", 1);
  assert.equal(hit(limit, 1).passed, true);
  assert.equal(hit(limit, 1).passed, false);
  assert.equal(hit(limit, 2).passed, true);
});

test("窗口过期后重新计数", async () => {
  const limit = userRateLimit("t3", 1, 30);
  assert.equal(hit(limit, 1).passed, true);
  assert.equal(hit(limit, 1).passed, false);
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(hit(limit, 1).passed, true);
});

test("token 估算向上取整，随字数增长", () => {
  assert.equal(estimateTokens(0), 0);
  assert.equal(estimateTokens(3), 2);
  assert.ok(estimateTokens(3000) > estimateTokens(300));
});
