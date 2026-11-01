import { AsyncLocalStorage } from "node:async_hooks";
import type { Request } from "express";

// 当前请求的登录用户：由鉴权中间件写入，业务代码通过 currentUserId() 读取，不再使用固定的开发用户
const storage = new AsyncLocalStorage<number>();

export const runAsUser = <T>(userId: number, fn: () => T): T => storage.run(userId, fn);

export const currentUserId = (): number => {
  const id = storage.getStore();
  if (id === undefined) throw new Error("当前请求没有登录用户");
  return id;
};

// multer 的回调拿不到异步上下文，这类场景直接从请求对象读取
export type AuthedRequest = Request & { userId: number };
