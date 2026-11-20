import assert from "node:assert/strict";
import { test } from "node:test";
import { buildSystemPrompt } from "./prompt";
import type { RetrievedChunk } from "../rag/retrieve";

const chunk = { documentName: "手册", page: 3, content: "第一段资料" } as RetrievedChunk;

test("有资料时按编号放入提示词，并带页码", () => {
  const prompt = buildSystemPrompt([chunk]);
  assert.match(prompt, /\[1\] 《手册》第 3 页\n第一段资料/);
});

test("没有资料时引导使用通用知识回答", () => {
  assert.match(buildSystemPrompt([]), /没有检索到相关资料/);
});

test("回复风格：平衡不加约束，简洁和详细各加一句，有无资料都生效", () => {
  const base = buildSystemPrompt([chunk]);
  assert.equal(buildSystemPrompt([chunk], "balanced"), base);
  assert.match(buildSystemPrompt([chunk], "concise"), /回答风格：尽量简洁/);
  assert.match(buildSystemPrompt([], "detailed"), /回答风格：尽量详细/);
});

test("严格模式：有资料时只允许依据资料，不含“通用知识”的放行说法", () => {
  const prompt = buildSystemPrompt([chunk], "balanced", { strict: true });
  assert.match(prompt, /严格模式/);
  assert.match(prompt, /\[1\] 《手册》第 3 页\n第一段资料/);
  assert.match(prompt, /不要使用你自己的知识/);
  assert.doesNotMatch(prompt, /以“【通用知识】”开头/);
});

test("严格模式：没有资料时要求直接说明没有找到相关内容", () => {
  assert.match(buildSystemPrompt([], "balanced", { strict: true }), /知识库中没有找到相关内容。/);
});

test("知识库回答指令：写入提示词，非严格和严格模式都生效；没有指令时不出现", () => {
  const instructions = [{ name: "法律资料", text: "回答要引用条款" }];
  assert.match(buildSystemPrompt([chunk], "balanced", { instructions }), /《法律资料》：回答要引用条款/);
  assert.match(buildSystemPrompt([chunk], "balanced", { strict: true, instructions }), /《法律资料》：回答要引用条款/);
  assert.match(buildSystemPrompt([], "balanced", { instructions }), /《法律资料》：回答要引用条款/);
  assert.doesNotMatch(buildSystemPrompt([chunk], "balanced", { instructions: [] }), /知识库说明/);
});

test("此前对话摘要：写入提示词并标明不是资料；没有摘要时不出现", () => {
  const historySummary = "用户想了解 RAG 的检索流程，已确认使用 Qdrant。";
  const prompt = buildSystemPrompt([chunk], "balanced", { historySummary });
  assert.match(prompt, /此前的对话摘要/);
  assert.match(prompt, /用户想了解 RAG 的检索流程，已确认使用 Qdrant。/);
  // 必须说明它不是资料，否则模型可能给摘要内容也标 [编号]
  assert.match(prompt, /不是检索到的资料/);
  assert.doesNotMatch(buildSystemPrompt([chunk]), /此前的对话摘要/);
  // 严格模式也要带上，否则长对话在严格模式下会丢上下文
  assert.match(buildSystemPrompt([], "balanced", { strict: true, historySummary }), /此前的对话摘要/);
});
