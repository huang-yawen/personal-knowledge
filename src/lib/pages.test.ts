import { expect, test } from "vitest";
import { lazyPage, pageKeyByPath, type PageKey } from "./pages";

const EXPECTED_PATHS = ["/", "/chat", "/knowledge", "/notes", "/profile", "/admin"];
const EXPECTED_KEYS: PageKey[] = ["dashboard", "chat", "knowledge", "notes", "profile", "admin"];

test("路由路径到页面 key 的映射与路由表一致", () => {
  expect(Object.keys(pageKeyByPath).sort()).toEqual([...EXPECTED_PATHS].sort());
  EXPECTED_PATHS.forEach((path) => expect(EXPECTED_KEYS).toContain(pageKeyByPath[path]));
});

test("映射里没有指向不存在页面的 key", () => {
  expect([...new Set(Object.values(pageKeyByPath))].sort()).toEqual([...EXPECTED_KEYS].sort());
});

test("每个页面 key 都能创建 React.lazy 组件", () => {
  // lazy() 不会立即触发 import，所以这个断言很便宜；只要 $$typeof 存在就说明是 lazy 元素
  EXPECTED_KEYS.forEach((key) => {
    const component = lazyPage(key) as unknown as { $$typeof?: symbol };
    expect(typeof component.$$typeof).toBe("symbol");
  });
});
