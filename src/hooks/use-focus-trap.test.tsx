// @vitest-environment happy-dom
import { afterEach, expect, test } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useRef, useState } from "react";
import { useFocusTrap } from "./use-focus-trap";

afterEach(cleanup);

function Dialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, open);
  if (!open) return null;
  return (
    <div ref={ref} role="dialog" aria-label="测试对话框">
      <button type="button" onClick={onClose}>关闭</button>
      <button type="button">确认</button>
    </div>
  );
}

function App() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>打开</button>
      <Dialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}

test("打开时焦点进入对话框", () => {
  render(<App />);
  const opener = screen.getByText("打开") as HTMLButtonElement;
  opener.focus();
  fireEvent.click(opener);
  expect(document.activeElement).toBe(screen.getByText("关闭"));
});

test("Tab 在对话框内循环，不会跑到背后的页面", () => {
  render(<App />);
  fireEvent.click(screen.getByText("打开"));
  const first = screen.getByText("关闭");
  const last = screen.getByText("确认");

  // 从最后一个按 Tab 回到第一个
  last.focus();
  fireEvent.keyDown(last, { key: "Tab" });
  expect(document.activeElement).toBe(first);

  // 从第一个按 Shift+Tab 回到最后一个
  fireEvent.keyDown(first, { key: "Tab", shiftKey: true });
  expect(document.activeElement).toBe(last);
});

test("关闭后焦点回到打开它的元素", () => {
  render(<App />);
  const opener = screen.getByText("打开") as HTMLButtonElement;
  opener.focus();
  fireEvent.click(opener);
  fireEvent.click(screen.getByText("关闭"));
  expect(document.activeElement).toBe(opener);
});

test("未启用时不动焦点，避免影响普通页面", () => {
  render(
    <>
      <button type="button">页面上别的按钮</button>
      <Dialog open={false} onClose={() => {}} />
    </>,
  );
  const other = screen.getByText("页面上别的按钮") as HTMLButtonElement;
  other.focus();
  expect(document.activeElement).toBe(other);
});
