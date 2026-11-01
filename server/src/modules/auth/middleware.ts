import type { NextFunction, Request, RequestHandler, Response } from "express";
import { runAsUser, type AuthedRequest } from "./context";
import { findSessionUser, readSessionToken } from "./session";

// 写操作必须来自本站：浏览器带了 Origin 且与 Host 不一致时拒绝，配合 SameSite 防止跨站请求伪造
export const sameOriginOnly: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") return next();
  const origin = req.get("origin");
  if (origin) {
    let host: string | undefined;
    try {
      host = new URL(origin).host;
    } catch {
      host = undefined;
    }
    if (host !== req.host) {
      res.status(403).json({ error: "请求来源不被允许" });
      return;
    }
  }
  next();
};

// 之后的所有接口都需要登录：校验会话、把用户 id 写入请求上下文
export const requireAuth: RequestHandler = async (req, res, next) => {
  const token = readSessionToken(req);
  const userId = token ? await findSessionUser(token) : undefined;
  if (userId === undefined) {
    res.status(401).json({ error: "请先登录" });
    return;
  }
  (req as AuthedRequest).userId = userId;
  runAsUser(userId, () => next());
};
