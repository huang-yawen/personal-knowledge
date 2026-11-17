import type { ChatMessage } from "../conversation/repository";

// 上一轮问题最多取这么多字：拼进检索向量里的旧问题只是用来补主语，太长反而冲淡当前问题
const MAX_PREVIOUS_CHARS = 200;

// 整句只有这些词时，脱离上文根本看不懂，直接当作追问
const FOLLOW_UP_PHRASES = new Set([
  "为什么", "为啥", "怎么说", "什么意思", "啥意思", "举个例子",
  "继续", "然后呢", "接着呢", "还有呢", "还有吗", "展开", "展开说说", "详细说说",
]);

// 句子里出现这些指代或承接成分时，检索必须带上上一轮问题，否则向量里没有真正的主语。
// 排除“其它 / 其他”，它们不是代词
const REFERENCE_MARKER =
  /(?<!其)它们?|这个|那个|这些|那些|上述|刚才|上面提到|前面提到|上一[条步轮句]|第[一二三四五六七八九十\d]+[点条步种]|展开说说?|详细说说?|再说说/;

// 去掉空白和标点，用于整句比对（"为什么？" 应该等于 "为什么"）
const normalize = (question: string) => question.replace(/[\s，。？！?!、,.;；]+/g, "");

// 这个问题是否依赖上文才能检索到对的内容
const needsContext = (question: string) => FOLLOW_UP_PHRASES.has(normalize(question)) || REFERENCE_MARKER.test(question);

const truncate = (text: string, max: number) => {
  const chars = Array.from(text.trim());
  return chars.length <= max ? chars.join("") : chars.slice(0, max).join("");
};

/**
 * 生成用于向量检索的查询串（只影响检索，发给模型的仍是用户原话和历史消息）。
 *
 * 多轮对话里的追问 —— "它有什么优点""第二点展开说说""为什么" —— 单独拿去做向量检索时
 * 没有主语，命中的基本是随机内容；这类情况下把上一轮的用户问题拼在前面，给检索补上语境。
 * 独立的完整问题原样返回，避免把上一个话题的资料带进来。
 */
export const buildRetrievalQuery = (question: string, history: ChatMessage[]): string => {
  const previousUser = history.findLast((message) => message.role === "user");
  if (!previousUser || !needsContext(question)) return question;
  return `${truncate(previousUser.content, MAX_PREVIOUS_CHARS)}\n${question}`;
};
