// @vitest-environment happy-dom
import { afterEach, expect, test } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MarkdownView } from "./MarkdownView";

afterEach(cleanup);

test("渲染标题、表格和行内代码", () => {
  render(<MarkdownView content={"# 标题\n\n| 列 A | 列 B |\n| --- | --- |\n| 1 | 2 |\n\n行内 `code`"} />);
  expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("标题");
  expect(screen.getByRole("table")).toBeTruthy();
  expect(screen.getByText("code").tagName).toBe("CODE");
});

test("外链在新标签页打开并带 noreferrer", () => {
  render(<MarkdownView content="[示例](https://example.com/docs)" />);
  const link = screen.getByRole("link");
  expect(link.getAttribute("href")).toBe("https://example.com/docs");
  expect(link.getAttribute("target")).toBe("_blank");
  expect(link.getAttribute("rel")).toContain("noreferrer");
});

test("任务列表与代码块能渲染", () => {
  render(<MarkdownView content={"- [x] 已完成\n- [ ] 待办\n\n```js\nconst a = 1;\n```"} />);
  expect(screen.getAllByRole("checkbox")).toHaveLength(2);
  expect(screen.getByText(/const a = 1;/).tagName).toBe("CODE");
});
