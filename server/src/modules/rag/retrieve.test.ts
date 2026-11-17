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
const { filterByScore } = await import("./retrieve");

const hits = [{ score: 0.82 }, { score: 0.61 }, { score: 0.4 }, { score: 0.12 }];

test("下限为 0 表示不过滤", () => {
  assert.deepEqual(filterByScore(hits, 0), hits);
  assert.deepEqual(filterByScore(hits, -1), hits);
});

test("低于下限的命中被丢弃，等于下限的保留，顺序不变", () => {
  assert.deepEqual(filterByScore(hits, 0.4), [{ score: 0.82 }, { score: 0.61 }, { score: 0.4 }]);
  assert.deepEqual(filterByScore(hits, 0.5), [{ score: 0.82 }, { score: 0.61 }]);
});

test("全部低于下限时返回空数组", () => {
  assert.deepEqual(filterByScore(hits, 0.9), []);
});

test("空输入返回空数组", () => {
  assert.deepEqual(filterByScore([], 0.5), []);
});
