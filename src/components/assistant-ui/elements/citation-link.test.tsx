// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { CitationLink } from "./citation-link";
import { useReaderStore } from "@/lib/reader-store";

const state = vi.hoisted(() => ({
  sources: [] as { index: number; chunkId: number; documentId: number; documentName: string; page: number | null; content: string; score: number }[],
  streaming: false,
  incomplete: false,
}));

// CitationLink 只用到 useAuiState 的几个选择器，直接给它一个可控的假状态
vi.mock("@assistant-ui/react", () => ({
  useAuiState: (selector: (value: unknown) => unknown) =>
    selector({
      message: { metadata: { custom: { sources: state.sources, incomplete: state.incomplete } }, isLast: true },
      thread: { isRunning: state.streaming },
    }),
}));

const openReader = vi.fn();

afterEach(() => {
  cleanup();
  state.sources = [];
  state.streaming = false;
  state.incomplete = false;
});

const source = {
  index: 1,
  chunkId: 11,
  documentId: 7,
  documentName: "指南.md",
  page: 3,
  content: "片段",
  score: 0.8,
};

test("来源存在时渲染按钮，点击打开对应片段", () => {
  state.sources = [source];
  useReaderStore.setState({ open: openReader });

  render(<CitationLink href="#cite-1" />);
  fireEvent.click(screen.getByRole("button", { name: "打开引用 1：指南.md" }));

  expect(openReader).toHaveBeenCalledWith(7, 11);
});

test("生成过程中来源还没到，先显示中性角标", () => {
  state.streaming = true;
  const { container } = render(<CitationLink href="#cite-1" />);

  expect(container.querySelector(".citation-pending")?.textContent).toBe("1");
  expect(container.querySelector(".citation-invalid")).toBeNull();
  expect(screen.queryByRole("button")).toBeNull();
});

test("回答结束后仍对不上来源，标红而不是可点击", () => {
  state.sources = [source];
  const { container } = render(<CitationLink href="#cite-7" />);

  expect(container.querySelector(".citation-invalid")?.textContent).toBe("7");
  expect(screen.queryByRole("button")).toBeNull();
});

test("被停止的回答引用可能不全，不标红", () => {
  state.sources = [];
  state.incomplete = true;
  const { container } = render(<CitationLink href="#cite-1" />);

  expect(container.querySelector(".citation-pending")?.textContent).toBe("1");
  expect(container.querySelector(".citation-invalid")).toBeNull();
});

test("一个链接里的多个编号各自渲染角标", () => {
  state.sources = [source, { ...source, index: 2, chunkId: 12 }];
  render(<CitationLink href="#cite-1,2" />);

  expect(screen.getAllByRole("button")).toHaveLength(2);
});
