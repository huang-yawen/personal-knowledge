import assert from "node:assert/strict";
import { test } from "node:test";
import { parseSummary } from "./summary-parse";

test("解析正常的 JSON，问题最多保留 3 个", () => {
  const result = parseSummary('{"summary":"这是摘要","questions":["问题一","问题二","问题三","问题四"]}');
  assert.deepEqual(result, { summary: "这是摘要", questions: ["问题一", "问题二", "问题三"] });
});

test("兼容被代码块包裹的 JSON", () => {
  const result = parseSummary('```json\n{"summary":"摘要","questions":["问题"]}\n```');
  assert.deepEqual(result, { summary: "摘要", questions: ["问题"] });
});

test("摘要和问题超长时截断，空问题被丢弃", () => {
  const result = parseSummary(JSON.stringify({ summary: "字".repeat(500), questions: ["", "  ", "问".repeat(100), 42] }));
  assert.equal(Array.from(result!.summary).length, 300);
  assert.equal(result!.questions.length, 1);
  assert.equal(Array.from(result!.questions[0]).length, 60);
});

test("格式不对时返回 undefined", () => {
  assert.equal(parseSummary("不是 JSON"), undefined);
  assert.equal(parseSummary('{"summary":"","questions":[]}'), undefined);
  assert.equal(parseSummary('{"summary":"有摘要","questions":"不是数组"}'), undefined);
  assert.equal(parseSummary("null"), undefined);
});
