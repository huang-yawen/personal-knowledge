// 文档摘要：解析模型返回的 JSON（纯函数，便于测试）
const MAX_SUMMARY_CHARS = 300;
const MAX_QUESTION_CHARS = 60;

export type DocumentSummary = { summary: string; questions: string[] };

// 解析模型返回的 JSON：兼容被 ``` 包裹的情况；格式不对返回 undefined
export const parseSummary = (text: string): DocumentSummary | undefined => {
  const json = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    return undefined;
  }
  const { summary, questions } = (typeof data === "object" && data !== null ? data : {}) as Record<string, unknown>;
  if (typeof summary !== "string" || !summary.trim() || !Array.isArray(questions)) return undefined;
  return {
    summary: Array.from(summary.trim()).slice(0, MAX_SUMMARY_CHARS).join(""),
    questions: questions
      .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      .map((item) => Array.from(item.trim()).slice(0, MAX_QUESTION_CHARS).join(""))
      .slice(0, 3),
  };
};
