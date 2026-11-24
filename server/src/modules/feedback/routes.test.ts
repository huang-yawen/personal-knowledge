import assert from "node:assert/strict";
import test from "node:test";
import { parseFeedbackInput } from "./validation";

test("点赞只关心 rating，原因和说明被忽略", () => {
  assert.deepEqual(parseFeedbackInput({ rating: "positive", reason: "off_topic", comment: "x" }), {
    rating: "positive",
  });
});

test("点踩保留合法原因，说明去掉首尾空白", () => {
  assert.deepEqual(parseFeedbackInput({ rating: "negative", reason: "outdated", comment: "  资料是 2024 年的  " }), {
    rating: "negative",
    reason: "outdated",
    comment: "资料是 2024 年的",
  });
});

test("点踩可以只给原因不给说明", () => {
  assert.deepEqual(parseFeedbackInput({ rating: "negative", reason: "not_found" }), {
    rating: "negative",
    reason: "not_found",
  });
});

test("非法反馈类型被拒绝", () => {
  assert.equal(parseFeedbackInput({ rating: "up" }), "反馈类型不正确");
  assert.equal(parseFeedbackInput({}), "反馈类型不正确");
});

test("未知原因被拒绝", () => {
  assert.equal(parseFeedbackInput({ rating: "negative", reason: "boring" }), "反馈原因不正确");
});

test("说明必须是字符串且不超过 500 字", () => {
  assert.equal(parseFeedbackInput({ rating: "negative", comment: 42 }), "反馈说明格式不正确");
  assert.equal(parseFeedbackInput({ rating: "negative", comment: "长".repeat(501) }), "反馈说明不能超过 500 个字符");
});
