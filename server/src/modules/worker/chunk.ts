const CHUNK_SIZE = 800;
const OVERLAP = 100;

// 按固定窗口切块，相邻块重叠一小段，避免一句话被切断后丢失上下文
export const chunkText = (text: string): string[] => {
  const clean = text
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const chunks: string[] = [];
  let start = 0;
  while (start < clean.length) {
    let end = Math.min(start + CHUNK_SIZE, clean.length);
    if (end < clean.length) {
      // 只在窗口最后 1/4 里找段落或句末作为断点，避免切出过短的块
      const searchFrom = start + CHUNK_SIZE * 0.75;
      let cut = -1;
      for (const match of clean.slice(searchFrom, end).matchAll(/\n\n|\n|[。！？]|[.!?]\s/g)) {
        cut = match.index + match[0].length;
      }
      if (cut > 0) end = searchFrom + cut;
    }
    const piece = clean.slice(start, end).trim();
    if (piece) chunks.push(piece);
    if (end >= clean.length) break;
    start = end - OVERLAP;
  }
  return chunks;
};
