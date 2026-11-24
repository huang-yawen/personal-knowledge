// 切片策略版本：换切块规则时改这里，检索诊断和 documents.chunker_version 里能区分新旧文档
export const CHUNKER_VERSION = "v2";

export type PageText = { page: number | null; text: string };
export type ChunkKind = "text" | "table" | "code";

export type DocumentSection = {
  // 标题路径，如「检索调优 > 精排」；没有标题时为空
  headingPath: string;
  // 父块正文：检索命中子块后，用它给模型补上下文
  content: string;
  pageStart: number | null;
  pageEnd: number | null;
};

export type DocumentChunk = {
  content: string;
  headingPath: string;
  page: number | null;
  kind: ChunkKind;
  // 指向 sections 数组的下标
  sectionIndex: number;
};

const MAX_CHUNK = 500;
const MAX_SPECIAL = 2000;
const OVERLAP = 80;
const HEADING = /^(#{1,6})\s+(.+?)\s*$/;

// 规整换行与多余空行，避免把 PDF 的硬换行原样带进提示词
const clean = (text: string) =>
  text
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

// 长文本按目标长度切分，优先在段落/句末断开，相邻块保留一小段重叠
const splitLongText = (text: string, max = MAX_CHUNK, overlap = OVERLAP): string[] => {
  const value = clean(text);
  const chunks: string[] = [];
  let start = 0;
  while (start < value.length) {
    let end = Math.min(start + max, value.length);
    if (end < value.length) {
      const searchFrom = start + Math.floor(max * 0.6);
      let cut = -1;
      for (const match of value.slice(searchFrom, end).matchAll(/\n\n|\n|[。！？.!?]\s/g)) {
        cut = match.index + match[0].length;
      }
      if (cut > 0) end = searchFrom + cut;
    }
    const piece = value.slice(start, end).trim();
    if (piece) chunks.push(piece);
    if (end >= value.length) break;
    start = Math.max(end - overlap, start + 1);
  }
  return chunks;
};

// 把 section 拆成块：代码块和表格不拆，普通文本按段落打包
const splitBlocks = (text: string): { content: string; kind: ChunkKind }[] => {
  const lines = clean(text).split("\n");
  const blocks: { content: string; kind: ChunkKind }[] = [];
  let buffer: string[] = [];
  const flush = () => {
    const content = buffer.join("\n").trim();
    if (content) blocks.push({ content, kind: "text" });
    buffer = [];
  };

  for (let index = 0; index < lines.length; ) {
    const line = lines[index];
    const fence = line.trimStart().match(/^(`{3,}|~{3,})/);
    if (fence) {
      flush();
      const code = [line];
      const marker = fence[1][0];
      index += 1;
      while (index < lines.length) {
        code.push(lines[index]);
        if (lines[index].trimStart().startsWith(marker.repeat(3))) {
          index += 1;
          break;
        }
        index += 1;
      }
      blocks.push({ content: code.join("\n").trim(), kind: "code" });
      continue;
    }
    if (line.trimStart().startsWith("|")) {
      flush();
      const table: string[] = [];
      while (index < lines.length && lines[index].trimStart().startsWith("|")) {
        table.push(lines[index]);
        index += 1;
      }
      blocks.push({ content: table.join("\n").trim(), kind: "table" });
      continue;
    }
    buffer.push(line);
    index += 1;
  }
  flush();
  return blocks;
};

const packBlocks = (blocks: { content: string; kind: ChunkKind }[]): { content: string; kind: ChunkKind }[] => {
  const chunks: { content: string; kind: ChunkKind }[] = [];
  let current: { content: string; kind: ChunkKind } | null = null;
  const flush = () => {
    if (current) chunks.push(current);
    current = null;
  };

  for (const block of blocks) {
    // 代码/表格整体保留（超大时才硬切），避免把表格从中间截断
    if (block.kind !== "text" || block.content.length > MAX_CHUNK) {
      flush();
      if (block.content.length <= MAX_SPECIAL) {
        chunks.push(block);
      } else if (block.kind === "text") {
        for (const piece of splitLongText(block.content)) chunks.push({ content: piece, kind: "text" });
      } else {
        for (let start = 0; start < block.content.length; start += MAX_SPECIAL) {
          chunks.push({ content: block.content.slice(start, start + MAX_SPECIAL), kind: block.kind });
        }
      }
      continue;
    }
    if (current && current.content.length + 2 + block.content.length <= MAX_CHUNK) {
      current.content = `${current.content}\n\n${block.content}`;
    } else {
      flush();
      current = { ...block };
    }
  }
  flush();
  return chunks;
};

// 按 Markdown 标题切 section；没有标题的文档（PDF/TXT）按页切
const buildSections = (pages: PageText[]): DocumentSection[] => {
  const sections: DocumentSection[] = [];

  for (const { page, text } of pages) {
    const cleaned = clean(text);
    if (!cleaned) continue;
    const lines = cleaned.split("\n");
    const hasHeading = lines.some((line) => HEADING.test(line));

    if (!hasHeading) {
      sections.push({
        headingPath: page === null ? "" : `第 ${page} 页`,
        content: cleaned,
        pageStart: page,
        pageEnd: page,
      });
      continue;
    }

    const stack: { level: number; title: string }[] = [];
    let current: { headingPath: string; lines: string[]; pageStart: number | null; hasHeading: boolean } | null = null;
    const flush = () => {
      if (!current) return;
      const content = current.lines.join("\n").trim();
      // 只有标题、没有正文的 section 不单独成块
      const body = current.hasHeading ? current.lines.slice(1).join("\n").trim() : content;
      if (content && body) {
        sections.push({
          headingPath: current.headingPath,
          content,
          pageStart: current.pageStart,
          pageEnd: page,
        });
      }
      current = null;
    };

    for (const line of lines) {
      const match = HEADING.exec(line);
      if (match) {
        flush();
        const level = match[1].length;
        while (stack.length > 0 && stack[stack.length - 1].level >= level) stack.pop();
        stack.push({ level, title: match[2] });
        current = {
          headingPath: stack.map((item) => item.title).join(" > "),
          lines: [line],
          pageStart: page,
          hasHeading: true,
        };
      } else if (current) {
        current.lines.push(line);
      } else {
        // 第一个标题之前的内容（文档简介等）
        current = { headingPath: "", lines: [line], pageStart: page, hasHeading: false };
      }
    }
    flush();
  }

  return sections;
};

/**
 * 解析结果 → 父 section + 子分块。
 *
 * 子块用于向量检索，尽量短（~500 字）以保证匹配精度；
 * 父 section 保存完整段落，命中后由 buildContext 取一段上下文喂给模型。
 */
export const chunkPages = (pages: PageText[]) => {
  const sections = buildSections(pages);
  const chunks: DocumentChunk[] = [];
  sections.forEach((section, sectionIndex) => {
    for (const piece of packBlocks(splitBlocks(section.content))) {
      chunks.push({
        content: piece.content,
        headingPath: section.headingPath,
        page: section.pageStart,
        kind: piece.kind,
        sectionIndex,
      });
    }
  });
  return { sections, chunks };
};

/**
 * 从父 section 里取子块附近的上下文，最长 maxChars。
 * 模型看到的是一个完整段落，而不是被切断的 500 字窗口。
 */
export const buildContext = (section: string, chunk: string, maxChars = 1500): string => {
  if (section.length <= maxChars) return section;
  if (chunk.length >= maxChars) return chunk.slice(0, maxChars);
  const index = section.indexOf(chunk);
  if (index < 0) return section.slice(0, maxChars);
  const half = Math.floor((maxChars - chunk.length) / 2);
  let start = Math.max(0, index - half);
  let end = Math.min(section.length, start + maxChars);
  start = Math.max(0, end - maxChars);
  return section.slice(start, end);
};
