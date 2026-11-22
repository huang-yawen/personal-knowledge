// @vitest-environment happy-dom
import { afterEach, expect, test, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ErrorBoundary } from "./ErrorBoundary";

afterEach(cleanup);

function Boom(): never {
  throw new Error("渲染炸了");
}

test("子组件抛错时显示提示，而不是整页白屏", () => {
  // 错误边界自己会 console.error，测试里静音，避免污染输出
  const spy = vi.spyOn(console, "error").mockImplementation(() => {});
  render(
    <ErrorBoundary>
      <Boom />
    </ErrorBoundary>,
  );
  const alert = screen.getByRole("alert");
  expect(alert.textContent).toContain("页面出错了");
  expect(alert.textContent).toContain("渲染炸了");
  expect(screen.getByRole("button").textContent).toContain("刷新页面");
  spy.mockRestore();
});

test("没有错误时原样渲染子组件", () => {
  render(
    <ErrorBoundary>
      <p>正常内容</p>
    </ErrorBoundary>,
  );
  expect(screen.getByText("正常内容")).toBeTruthy();
  expect(screen.queryByRole("alert")).toBeNull();
});
