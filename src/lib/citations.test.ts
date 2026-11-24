import { expect, test } from "vitest";
import { countInvalidCitations, parseCitationNumbers } from "@/lib/citations";

test("解析单个、连写和逗号分隔的引用", () => {
  expect(parseCitationNumbers("结论见 [1]，补充见 [2][3] 和 [4, 5]")).toEqual([1, 2, 3, 4, 5]);
  expect(parseCitationNumbers("[1，2] 和 [1、2]")).toEqual([1, 2, 1, 2]);
});

test("不把四位年份或普通方括号当成引用", () => {
  expect(parseCitationNumbers("2026 年 [2024] 的数据，[注] 不是引用")).toEqual([]);
  expect(parseCitationNumbers("只有 [0] 这种非法编号")).toEqual([]);
});

test("无效引用按出现次数统计", () => {
  const sources = [{ index: 1 }, { index: 2 }];
  expect(countInvalidCitations("见 [1] 和 [2]", sources)).toBe(0);
  expect(countInvalidCitations("见 [1]、[3] 和 [9]", sources)).toBe(2);
  // 同一个无效编号出现两次算两处
  expect(countInvalidCitations("[7] 与 [7]", sources)).toBe(2);
});
