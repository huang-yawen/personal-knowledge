import { lazy } from "react";

// 页面按路由懒加载：CodeMirror（笔记）、assistant-ui（对话）、react-markdown 这些重依赖
// 只在进入对应页面时才下载，首屏只需要工作台那一部分代码
const loaders = {
  dashboard: () => import("@/pages/Dashboard").then((module) => ({ default: module.Dashboard })),
  chat: () => import("@/pages/ChatPage").then((module) => ({ default: module.ChatPage })),
  knowledge: () => import("@/pages/KnowledgePage").then((module) => ({ default: module.KnowledgePage })),
  notes: () => import("@/pages/NotesPage").then((module) => ({ default: module.NotesPage })),
  profile: () => import("@/pages/ProfilePage").then((module) => ({ default: module.ProfilePage })),
  admin: () => import("@/pages/AdminPage").then((module) => ({ default: module.AdminPage })),
};

export type PageKey = keyof typeof loaders;

// 每个页面只包一次 lazy，在模块作用域调用，避免每次渲染创建新组件
export const lazyPage = (key: PageKey) => lazy(loaders[key]);

// 侧栏悬停/聚焦时提前下载目标页面的代码，点下去时通常已经就绪
export const prefetchPage = (key: PageKey) => {
  void loaders[key]();
};

// 路由路径 → 页面 key，供导航预取使用
export const pageKeyByPath: Record<string, PageKey> = {
  "/": "dashboard",
  "/chat": "chat",
  "/knowledge": "knowledge",
  "/notes": "notes",
  "/profile": "profile",
  "/admin": "admin",
};
