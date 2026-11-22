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
const { toBooleanQuery } = await import("./keyword");

test("去掉布尔检索的运算符，避免语法出错或被当成排除/通配", () => {
  assert.equal(toBooleanQuery("+必须 -排除"), "必须 排除");
  assert.equal(toBooleanQuery("型号 RTX-4090"), "型号 RTX 4090");
  assert.equal(toBooleanQuery("(a > b) ~c"), "a b c");
});

test("去掉引号和通配符，保留正文", () => {
  assert.equal(toBooleanQuery('"完整短语" 与 前缀*'), "完整短语 与 前缀");
});

test("压缩多余空白", () => {
  assert.equal(toBooleanQuery("向量   检索\n\n原理"), "向量 检索 原理");
});

test("纯符号清空后为空字符串，调用方应跳过关键词检索", () => {
  assert.equal(toBooleanQuery("+-()~*"), "");
  assert.equal(toBooleanQuery("   "), "");
});

test("英文、数字和中文都保留", () => {
  assert.equal(toBooleanQuery("Qdrant 1024 维 向量"), "Qdrant 1024 维 向量");
});
