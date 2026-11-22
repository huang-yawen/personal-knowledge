import { useEffect, useRef } from "react";

/**
 * 按 Escape 时执行回调，用于手写的下拉菜单和模态层。
 * 回调放在 ref 里，避免调用方每次渲染传入新函数导致反复解绑重绑。
 */
export const useEscapeKey = (active: boolean, onEscape: () => void) => {
  const handler = useRef(onEscape);
  handler.current = onEscape;

  useEffect(() => {
    if (!active) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") handler.current();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [active]);
};
