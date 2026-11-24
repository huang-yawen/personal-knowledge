// 点踩原因用固定枚举，前端展示中文，统计时不用再做字符串清洗
export const FEEDBACK_REASONS = [
  "off_topic", // 答非所问
  "outdated", // 资料过时
  "not_found", // 找不到信息
  "wrong_citation", // 引用错误
  "incomplete", // 内容不完整
  "other", // 其他
] as const;

export type FeedbackReason = (typeof FEEDBACK_REASONS)[number];
export type FeedbackRating = "positive" | "negative";

export type FeedbackInput = {
  rating: FeedbackRating;
  reason?: FeedbackReason;
  comment?: string;
};

// 校验请求体；不合法时返回错误文案，由路由转成 400。
// 放在单独文件里：路由模块会连带加载数据库配置，纯逻辑测试不需要这些
export const parseFeedbackInput = (value: unknown): FeedbackInput | string => {
  const body = (typeof value === "object" && value !== null ? value : {}) as Record<string, unknown>;
  if (body.rating !== "positive" && body.rating !== "negative") return "反馈类型不正确";
  if (body.rating === "positive") return { rating: "positive" };
  if (body.reason !== undefined && body.reason !== null && !FEEDBACK_REASONS.includes(body.reason as FeedbackReason)) {
    return "反馈原因不正确";
  }
  if (body.comment !== undefined && typeof body.comment !== "string") return "反馈说明格式不正确";
  const comment = typeof body.comment === "string" ? body.comment.trim() : "";
  if (Array.from(comment).length > 500) return "反馈说明不能超过 500 个字符";
  return {
    rating: "negative",
    ...(body.reason ? { reason: body.reason as FeedbackReason } : {}),
    ...(comment ? { comment } : {}),
  };
};
