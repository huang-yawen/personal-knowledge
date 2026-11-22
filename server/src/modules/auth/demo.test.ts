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
const { demoRequestAllowed } = await import("./demo");

test("读操作一律放行", () => {
  for (const method of ["GET", "HEAD", "OPTIONS"]) {
    assert.equal(demoRequestAllowed(method, "/knowledge-bases"), true);
    assert.equal(demoRequestAllowed(method, "/notes/1"), true);
  }
});

test("提问和退出登录放行", () => {
  assert.equal(demoRequestAllowed("POST", "/chat"), true);
  assert.equal(demoRequestAllowed("POST", "/auth/logout"), true);
});

test("上传、删除、改名、改设置都被拒", () => {
  const blocked = [
    ["POST", "/knowledge-bases"],
    ["POST", "/knowledge-bases/16/documents"],
    ["DELETE", "/documents/1"],
    ["PATCH", "/documents/1"],
    ["POST", "/documents/1/retry"],
    ["POST", "/notes"],
    ["PATCH", "/notes/1"],
    ["DELETE", "/notes/1"],
    ["PUT", "/notes/1/knowledge-base"],
    ["PUT", "/settings"],
    ["POST", "/notes/ai"],
    ["POST", "/conversations/1/summary"],
    ["DELETE", "/account"],
    ["POST", "/auth/password"],
    ["POST", "/admin/invites"],
  ];
  for (const [method, path] of blocked) {
    assert.equal(demoRequestAllowed(method, path), false, `${method} ${path} 应该被拒`);
  }
});

test("路径匹配是整体匹配，不会被前缀绕过", () => {
  // /chatXXX 不是 /chat，不能借它绕过只读限制
  assert.equal(demoRequestAllowed("POST", "/chatroom"), false);
  assert.equal(demoRequestAllowed("POST", "/auth/logout-all"), false);
});
