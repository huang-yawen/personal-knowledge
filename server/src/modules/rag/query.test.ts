import assert from "node:assert/strict";
import { test } from "node:test";
import { buildRetrievalQuery } from "./query";
import type { ChatMessage } from "../conversation/repository";

const history = (...contents: string[]): ChatMessage[] =>
  contents.map((content, index) => ({ role: index % 2 === 0 ? "user" : "assistant", content }));

test("首轮提问没有上文，原样检索", () => {
  assert.equal(buildRetrievalQuery("它有什么优点", []), "它有什么优点");
});

test("指代类追问带上上一轮问题", () => {
  const query = buildRetrievalQuery("它有什么优点", history("Transformer 的注意力机制是怎么工作的？", "……"));
  assert.ok(query.startsWith("Transformer 的注意力机制是怎么工作的？"));
  assert.ok(query.endsWith("它有什么优点"));
});

test("序数类追问带上上一轮问题", () => {
  const query = buildRetrievalQuery("第二点展开说说", history("帮我总结一下这篇文档的要点", "……"));
  assert.ok(query.includes("帮我总结一下这篇文档的要点"));
  assert.ok(query.includes("第二点展开说说"));
});

test("整句只是承接词的也算追问", () => {
  for (const question of ["为什么？", "继续", " 展开说说。", "然后呢"]) {
    const query = buildRetrievalQuery(question, history("上一轮的问题", "……"));
    assert.ok(query.includes("上一轮的问题"), `"${question}" 应该带上下文`);
  }
});

test("独立的完整问题不带上下文，避免串话题", () => {
  for (const question of ["什么是 RAG？", "为什么天空是蓝的", "Python 的 GIL 是什么", "其他文件怎么处理"]) {
    assert.equal(buildRetrievalQuery(question, history("上一轮问的是完全无关的话题", "……")), question);
  }
});

test("上一轮是助手消息时，往前找最近的一条用户消息", () => {
  const messages: ChatMessage[] = [
    { role: "user", content: "向量检索的原理" },
    { role: "assistant", content: "……" },
    { role: "user", content: "那它的缺点呢" },
    { role: "assistant", content: "……" },
  ];
  const query = buildRetrievalQuery("展开说说", messages);
  assert.ok(query.includes("那它的缺点呢"));
});

test("过长的上一轮问题会被截断", () => {
  const long = "甲".repeat(500);
  const query = buildRetrievalQuery("它呢", history(long, "……"));
  assert.ok(query.length < 500 + 10);
  assert.ok(query.endsWith("它呢"));
});
