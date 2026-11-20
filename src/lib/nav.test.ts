import { expect, test } from "vitest";
import { ADMIN_NAV_ITEM, NAV_ITEMS, findNavItem } from "./nav";

test("根路径只匹配工作台，不会被当成其它页面的前缀", () => {
  expect(findNavItem("/")?.label).toBe("工作台");
  // "/" 是精确匹配，不能用前缀匹配，否则任何路径都会命中工作台
  expect(findNavItem("/notes")?.label).not.toBe("工作台");
});

test("一级页面的路径能正确匹配", () => {
  expect(findNavItem("/chat")?.label).toBe("AI 对话");
  expect(findNavItem("/knowledge")?.label).toBe("我的知识库");
  expect(findNavItem("/notes")?.label).toBe("我的笔记");
  expect(findNavItem("/profile")?.label).toBe("个人中心");
  expect(findNavItem("/admin")?.label).toBe("管理");
});

test("带尾斜杠的地址也能匹配", () => {
  expect(findNavItem("/chat/")?.label).toBe("AI 对话");
  expect(findNavItem("/notes/")?.label).toBe("我的笔记");
});

test("子路径归属到所属的一级页面", () => {
  expect(findNavItem("/notes/12")?.label).toBe("我的笔记");
  expect(findNavItem("/knowledge/3/documents")?.label).toBe("我的知识库");
});

test("只是前缀相同但不在同一层级的路径不算匹配", () => {
  // /chatty 不是 /chat 的子路径，否则会出现错误的导航高亮
  expect(findNavItem("/chatty")).toBeUndefined();
  expect(findNavItem("/notesbook")).toBeUndefined();
});

test("未知路径返回 undefined，由路由表负责重定向", () => {
  expect(findNavItem("/not-a-page")).toBeUndefined();
  expect(findNavItem("/a/b/c")).toBeUndefined();
});

test("导航路径唯一，且都以斜杠开头", () => {
  const paths = [...NAV_ITEMS, ADMIN_NAV_ITEM].map((item) => item.path);
  expect(new Set(paths).size).toBe(paths.length);
  expect(paths.every((path) => path.startsWith("/"))).toBe(true);
});
