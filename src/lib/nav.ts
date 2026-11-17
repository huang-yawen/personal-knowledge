import type { ComponentType } from "react";
import { FileText, Grid2X2, LibraryBig, MessageSquareText, ShieldCheck, UserRound } from "lucide-react";

export const APP_NAME = "Personal Knowledge";

export type NavItem = {
  // 路由路径，也是导航项的唯一标识
  path: string;
  label: string;
  icon: ComponentType<{ size?: number; strokeWidth?: number }>;
  // 浏览器标签页标题
  title: string;
};

// 一级导航，顺序即侧栏顺序
export const NAV_ITEMS: NavItem[] = [
  { path: "/", label: "工作台", icon: Grid2X2, title: "工作台" },
  { path: "/chat", label: "AI 对话", icon: MessageSquareText, title: "AI 对话" },
  { path: "/knowledge", label: "我的知识库", icon: LibraryBig, title: "我的知识库" },
  { path: "/notes", label: "我的笔记", icon: FileText, title: "我的笔记" },
  { path: "/profile", label: "个人中心", icon: UserRound, title: "个人中心" },
];

// 管理入口只对管理员显示，接口另有服务端校验
export const ADMIN_NAV_ITEM: NavItem = { path: "/admin", label: "管理", icon: ShieldCheck, title: "管理" };

// 当前路径是否属于某个导航项：根路径要求完全相等，其余允许子路径（如 /notes/12、/chat/）
const matches = (pathname: string, path: string) =>
  path === "/" ? pathname === "/" : pathname === path || pathname.startsWith(`${path}/`);

// 找到当前路径对应的导航项（含管理页）；没有对应页面时返回 undefined（如未知路径重定向之前）
export const findNavItem = (pathname: string) =>
  [...NAV_ITEMS, ADMIN_NAV_ITEM].find((item) => matches(pathname, item.path));
