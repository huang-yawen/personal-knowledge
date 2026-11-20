import { expect, test } from "vitest";
import { errorMessage } from "./utils";

test("Error 取 message", () => {
  expect(errorMessage(new Error("请求失败（500）"))).toBe("请求失败（500）");
});

test("字符串原样返回", () => {
  expect(errorMessage("网络中断")).toBe("网络中断");
});

test("其他类型（含 undefined）给出统一兜底文案，不显示成 undefined", () => {
  expect(errorMessage(undefined)).toBe("操作失败，请稍后重试");
  expect(errorMessage(null)).toBe("操作失败，请稍后重试");
  expect(errorMessage({ code: 500 })).toBe("操作失败，请稍后重试");
});
