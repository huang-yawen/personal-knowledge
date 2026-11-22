import assert from "node:assert/strict";
import { test } from "node:test";
import { reciprocalRankFusion } from "./fuse";

test("同时出现在两路且名次靠前的排在最前", () => {
  const fused = reciprocalRankFusion([
    [7, 3, 9],
    [3, 12],
  ]);
  assert.equal(fused[0].id, 3);
  assert.ok(fused[0].score > fused[1].score);
});

test("只在一路里出现的条目也会保留", () => {
  const fused = reciprocalRankFusion([
    [1, 2],
    [3, 4],
  ]);
  assert.deepEqual(
    fused.map((hit) => hit.id).sort((a, b) => a - b),
    [1, 2, 3, 4],
  );
});

test("同一路里重复出现的只按最好名次算一次", () => {
  const withDuplicate = reciprocalRankFusion([[5, 5, 5]]);
  const withoutDuplicate = reciprocalRankFusion([[5]]);
  assert.equal(withDuplicate.length, 1);
  assert.equal(withDuplicate[0].score, withoutDuplicate[0].score);
});

test("超出 limit 的部分被截断，且保持顺序", () => {
  const fused = reciprocalRankFusion([[1, 2, 3, 4], [2, 1]], { limit: 2 });
  assert.deepEqual(
    fused.map((hit) => hit.id),
    [1, 2],
  );
});

test("空输入返回空数组，单路为空不影响另一路", () => {
  assert.deepEqual(reciprocalRankFusion([]), []);
  assert.deepEqual(reciprocalRankFusion([[], []]), []);
  assert.deepEqual(
    reciprocalRankFusion([[], [8]]).map((hit) => hit.id),
    [8],
  );
});

test("分数相同时按 id 升序，结果稳定", () => {
  // 两个条目各自在一路里排第 1，分数完全相同，此时顺序只能由 id 决定
  assert.deepEqual(
    reciprocalRankFusion([[3], [1]]).map((hit) => hit.id),
    [1, 3],
  );
  assert.deepEqual(
    reciprocalRankFusion([[1], [3]]).map((hit) => hit.id),
    [1, 3],
  );
});

test("k 越小，第一名相对第二名的优势越大", () => {
  const smallK = reciprocalRankFusion([[1, 2]], { k: 1 });
  const largeK = reciprocalRankFusion([[1, 2]], { k: 1000 });
  assert.ok(smallK[0].score / smallK[1].score > largeK[0].score / largeK[1].score);
});
