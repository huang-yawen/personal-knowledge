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
