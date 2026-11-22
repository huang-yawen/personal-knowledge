import { useEffect, type RefObject } from "react";

// 可聚焦元素的选择器：和浏览器默认的 Tab 顺序基本一致
const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * 把键盘焦点锁在容器内，用于模态层和抽屉：
 * - 打开时把焦点移进容器（优先第一个可聚焦元素）
 * - Tab / Shift+Tab 在容器内循环，不会跑到背后的页面上
 * - 关闭时把焦点还给打开它的那个元素
 *
 * DESIGN.md 第 7 节要求「模态层、抽屉和菜单需处理焦点进入与返回」，这个 hook 就是那件事。
 */
export const useFocusTrap = (ref: RefObject<HTMLElement | null>, active: boolean) => {
  useEffect(() => {
    if (!active) return;
    const container = ref.current;
    if (!container) return;

    // 打开前的焦点位置，关闭时还回去
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const list = () => Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE));

    // 容器里一个可聚焦元素都没有时，让容器自己可聚焦，Focus 才进得来
    if (!container.hasAttribute("tabindex") && list().length === 0) container.setAttribute("tabindex", "-1");
    (list()[0] ?? container).focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const items = list();
      if (items.length === 0) {
        event.preventDefault();
        container.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const current = document.activeElement;

      if (event.shiftKey && (current === first || current === container)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && current === last) {
        event.preventDefault();
        first.focus();
      }
    };

    container.addEventListener("keydown", onKeyDown);
    return () => {
      container.removeEventListener("keydown", onKeyDown);
      if (previous && document.contains(previous)) previous.focus();
    };
  }, [ref, active]);
};
