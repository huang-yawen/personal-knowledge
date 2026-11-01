import assert from "node:assert/strict";
import { test } from "node:test";
import { hashPassword, verifyPassword } from "./password";

test("正确的密码校验通过，错误的不通过", async () => {
  const hash = await hashPassword("correct horse 密码 $%");
  assert.equal(await verifyPassword("correct horse 密码 $%", hash), true);
  assert.equal(await verifyPassword("correct horse 密码 $", hash), false);
  assert.equal(await verifyPassword("", hash), false);
});

test("同一个密码每次哈希结果不同（带随机盐），且不含明文", async () => {
  const [a, b] = await Promise.all([hashPassword("same-password"), hashPassword("same-password")]);
  assert.notEqual(a, b);
  assert.ok(!a.includes("same-password"));
});

test("格式损坏的哈希校验为失败而不是抛错", async () => {
  assert.equal(await verifyPassword("whatever", "not-a-valid-hash"), false);
});
