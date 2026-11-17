export { cn } from "cn";

// 统一的错误文案提取：catch 到的值可能是 Error、字符串或其他对象，直接 as Error 会把非 Error 显示成 undefined
export const errorMessage = (reason: unknown): string =>
  reason instanceof Error ? reason.message : typeof reason === "string" ? reason : "操作失败，请稍后重试";
