import assert from "node:assert/strict";
import { test } from "node:test";
import { buildContext, chunkPages } from "./chunk";

test("空文本不产生 section 和分块", () => {
  assert.deepEqual(chunkPages([{ page: null, text: "  \n\n \t\n" }]), { sections: [], chunks: [] });
  assert.deepEqual(chunkPages([]), { sections: [], chunks: [] });
});

test("按 Markdown 标题切 section，并记录完整标题路径", () => {
  const text = [
    "# 指南",
    "",
    "总体介绍。",
    "",
    "## 检索",
    "",
    "检索这一节说明召回与精排。",
    "",
    "### 精排",
    "",
    "精排用 cross-encoder 重新排序。",
  ].join("\n");
  const { sections, chunks } = chunkPages([{ page: null, text }]);

  assert.ok(sections.some((section) => section.headingPath === "指南"));
  assert.ok(sections.some((section) => section.headingPath === "指南 > 检索 > 精排"));
  const rerankChunks = chunks.filter((chunk) => chunk.headingPath === "指南 > 检索 > 精排");
  assert.equal(rerankChunks.length, 1);
  assert.match(rerankChunks[0].content, /cross-encoder/);
});

test("只有标题没有正文的 section 不单独成块", () => {
  const { sections, chunks } = chunkPages([{ page: null, text: "# 空章节\n\n## 有正文\n\n这里有内容。" }]);
  assert.deepEqual(sections.map((section) => section.headingPath), ["空章节 > 有正文"]);
  assert.equal(chunks.length, 1);
});

test("表格整体保留，不会从中间切断", () => {
  const rows = Array.from({ length: 40 }, (_, index) => `| 行 ${index} | 值 ${index} |`).join("\n");
  const text = `## 配置\n\n| 名称 | 值 |\n| --- | --- |\n${rows}\n`;
  const { chunks } = chunkPages([{ page: null, text }]);

  const table = chunks.find((chunk) => chunk.kind === "table");
  assert.ok(table);
  assert.match(table.content, /行 0/);
  assert.match(table.content, /行 39/);
  // 整张表是一块（超过 2000 字才会硬切，这里没有）
  assert.equal(chunks.filter((chunk) => chunk.kind === "table").length, 1);
});

test("代码块整体保留，不会被当成普通段落", () => {
  const code = ["```ts", "const answer = 42;", "console.log(answer);", "```"].join("\n");
  const text = `## 示例\n\n${code}\n\n后面还有一段说明。`;
  const { chunks } = chunkPages([{ page: null, text }]);

  const block = chunks.find((chunk) => chunk.kind === "code");
  assert.ok(block);
  assert.match(block.content, /console\.log/);
  assert.match(block.content, /```/);
});

test("长文本切成约 500 字的块，相邻块有重叠且不丢内容", () => {
  const sentence = "这是一句用于测试分块的话。";
  const text = sentence.repeat(300);
  const { chunks } = chunkPages([{ page: null, text }]);

  assert.ok(chunks.length > 1);
  assert.ok(chunks.every((chunk) => chunk.content.length <= 500));
  for (let i = 1; i < chunks.length; i++) {
    assert.ok(chunks[i - 1].content.includes(chunks[i].content.slice(0, 20)), `第 ${i} 块与上一块没有重叠`);
  }
  assert.ok(text.startsWith(chunks[0].content.slice(0, 50)));
  assert.ok(text.endsWith(chunks.at(-1)!.content.slice(-50)));
});

test("没有标题的 PDF 按页成 section，分块带正确页码", () => {
  const { sections, chunks } = chunkPages([
    { page: 1, text: "第一页的内容。" },
    { page: 2, text: "第二页的内容。" },
  ]);

  assert.deepEqual(sections.map((section) => section.headingPath), ["第 1 页", "第 2 页"]);
  assert.deepEqual(chunks.map((chunk) => chunk.page), [1, 2]);
});

test("buildContext 从父 section 里截取子块附近的上下文", () => {
  const section = `开头。${"无关内容。".repeat(300)}关键片段在这里。${"后续内容。".repeat(300)}末尾。`;
  const chunk = "关键片段在这里。";
  const context = buildContext(section, chunk, 600);

  assert.ok(context.length <= 600);
  assert.match(context, /关键片段在这里/);
  // 子块附近的内容应该保留，而不是永远从开头截
  assert.doesNotMatch(context, /^开头/);
});
