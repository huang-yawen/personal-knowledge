// 只处理正文文本节点，把 [1] / [2, 3] 变成 #cite- 链接；代码、行内代码和已有链接一律跳过
type MdNode = {
  type: string;
  value?: string;
  url?: string;
  children?: MdNode[];
  data?: Record<string, unknown>;
};

const SKIP = new Set(["code", "inlineCode", "link", "image", "html", "linkReference", "definition"]);

// 与 lib/citations.ts 保持一致：1~2 位数字，避免把 [2024] 当引用
const CITATION = /\[(\d{1,2}(?:\s*[,，、]\s*\d{1,2})*)\]/g;

const splitText = (value: string): MdNode[] => {
  const nodes: MdNode[] = [];
  let last = 0;
  for (const match of value.matchAll(CITATION)) {
    const start = match.index ?? 0;
    if (start > last) nodes.push({ type: "text", value: value.slice(last, start) });
    const numbers = match[1]
      .split(/[,，、]/)
      .map((part) => part.trim())
      .filter(Boolean);
    nodes.push({
      type: "link",
      url: `#cite-${numbers.join(",")}`,
      children: [{ type: "text", value: numbers.join(",") }],
    });
    last = start + match[0].length;
  }
  if (last < value.length) nodes.push({ type: "text", value: value.slice(last) });
  return nodes;
};

const walk = (node: MdNode) => {
  if (!node.children || SKIP.has(node.type)) return;
  const next: MdNode[] = [];
  for (const child of node.children) {
    if (child.type === "text" && typeof child.value === "string") next.push(...splitText(child.value));
    else {
      walk(child);
      next.push(child);
    }
  }
  node.children = next;
};

/**
 * remark 插件：把回答正文里的引用编号转成可点击的链接。
 * 链接的 URL 用 #cite- 前缀，渲染层（markdown-text.tsx 的 a 组件）据此换成角标按钮。
 */
export const remarkCitations = () => (tree: unknown) => {
  walk(tree as MdNode);
};
