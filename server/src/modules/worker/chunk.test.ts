import assert from "node:assert/strict";
import { test } from "node:test";
import { chunkText } from "./chunk";

test("空文本和纯空白不产生分块", () => {
  assert.deepEqual(chunkText(""), []);
  assert.deepEqual(chunkText("  \n\n \t\n"), []);
});

test("短文本只有一块，并规整换行和多余空行", () => {
  assert.deepEqual(chunkText("第一行\r\n\r\n\r\n\r\n第二行  \n第三行"), ["第一行\n\n第二行\n第三行"]);
});

test("长文本切成多块，每块不超过 800 字符，相邻块有重叠，且不丢内容", () => {
  const sentence = "这是一句用于测试分块的话。";
  const text = sentence.repeat(300);
  const chunks = chunkText(text);
  assert.ok(chunks.length > 1);
  assert.ok(chunks.every((chunk) => chunk.length <= 800));
  // 相邻块首尾重叠：后一块的开头在前一块结尾附近出现过
  for (let i = 1; i < chunks.length; i++) {
    assert.ok(chunks[i - 1].includes(chunks[i].slice(0, 20)), `第 ${i} 块与上一块没有重叠`);
  }
  assert.ok(text.startsWith(chunks[0].slice(0, 50)));
  assert.ok(text.endsWith(chunks.at(-1)!.slice(-50)));
});

test("优先在句末断开，而不是切断句子", () => {
  const chunks = chunkText("甲".repeat(700) + "。" + "乙".repeat(700));
  assert.ok(chunks[0].endsWith("。"));
});
