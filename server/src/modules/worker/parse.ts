import { readFile } from "node:fs/promises";
import { extractText } from "unpdf";

export type PageText = { page: number | null; text: string };

// 优先按 UTF-8 解码，失败再按 GB18030，兼容国内常见的 GBK 文本文件
const decodeText = (buffer: Buffer) => {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder("gb18030").decode(buffer);
  }
};

// PDF 按页返回并保留页码；TXT / Markdown 没有页的概念，页码为 null
export const parseFile = async (filePath: string, mimeType: string): Promise<PageText[]> => {
  const buffer = await readFile(filePath);
  if (mimeType === "application/pdf") {
    try {
      const { text } = await extractText(new Uint8Array(buffer));
      return text.map((pageText, index) => ({ page: index + 1, text: pageText }));
    } catch (error) {
      throw new Error(`PDF 解析失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return [{ page: null, text: decodeText(buffer) }];
};
