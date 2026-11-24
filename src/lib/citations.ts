// 引用编号：[1]、[1][2]、[1, 2] 都算；限制 1~2 位数字，避免把 [2024] 这类正文当成引用
const CITATION_PATTERN = /\[(\d{1,2}(?:\s*[,，、]\s*\d{1,2})*)\]/g;

// 从一段文字里取出所有被引用的编号（按出现顺序，保留重复）
export const parseCitationNumbers = (text: string): number[] => {
  const numbers: number[] = [];
  for (const match of text.matchAll(CITATION_PATTERN)) {
    for (const part of match[1].split(/[,，、]/)) {
      const number = Number.parseInt(part.trim(), 10);
      if (Number.isInteger(number) && number > 0) numbers.push(number);
    }
  }
  return numbers;
};

// 回答里引用了、但不在本次来源列表里的次数；用于提示「有 N 处引用无法对应资料」
export const countInvalidCitations = (text: string, sources: { index: number }[]): number => {
  const valid = new Set(sources.map((source) => source.index));
  return parseCitationNumbers(text).filter((number) => !valid.has(number)).length;
};
