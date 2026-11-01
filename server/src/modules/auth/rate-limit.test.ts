import assert from "node:assert/strict";
import { test } from "node:test";
import { clearFailures, isBlocked, recordFailure } from "./rate-limit";

test("连续失败 5 次后被拦截，成功后清零", () => {
  const key = "test|blocked";
  for (let i = 0; i < 4; i++) recordFailure(key);
  assert.equal(isBlocked(key), false);
  recordFailure(key);
  assert.equal(isBlocked(key), true);
  clearFailures(key);
  assert.equal(isBlocked(key), false);
});

test("不同 key 互不影响", () => {
  for (let i = 0; i < 5; i++) recordFailure("test|a");
  assert.equal(isBlocked("test|a"), true);
  assert.equal(isBlocked("test|b"), false);
  clearFailures("test|a");
});
