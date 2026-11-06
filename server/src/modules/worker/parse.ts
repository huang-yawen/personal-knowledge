import { readFile } from "node:fs/promises";
import mammoth from "mammoth";
import { extractText, getDocumentProxy } from "unpdf";

export type PageText = { page: number | null; text: string };

export const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

// 图片类型：扩展名 → MIME（上传校验和解析共用）
export const IMAGE_MIMES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

// 按文件头判断图片类型，避免只靠扩展名
export const sniffImageMime = (head: Buffer): string | null => {
  if (head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return "image/jpeg";
  if (head.subarray(0, 4).toString("latin1") === "RIFF" && head.subarray(8, 12).toString("latin1") === "WEBP") return "image/webp";
  return null;
};

// 优先按 UTF-8 解码，失败再按 GB18030，兼容国内常见的 GBK 文本文件
const decodeText = (buffer: Buffer) => {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder("gb18030").decode(buffer);
  }
};

// PDF 规范允许 %PDF- 出现在前 1024 字节内；去掉它之前的多余字节，返回 null 表示不是 PDF
export const stripPdfPrefix = (buffer: Buffer): Buffer | null => {
  const index = buffer.subarray(0, 1024 + 5).indexOf("%PDF-", 0, "latin1");
  return index < 0 ? null : buffer.subarray(index);
};

// 把 pdf.js 的异常归类成用户能看懂的原因
const pdfErrorMessage = (error: unknown) => {
  const name = error instanceof Error ? error.name : "";
  const message = error instanceof Error ? error.message : String(error);
  if (name === "PasswordException") return "PDF 已加密，请先去掉密码再上传";
  if (name === "InvalidPDFException" || name === "FormatError") return "PDF 文件已损坏或格式不受支持";
  return message;
};

// 备用方案：逐页提取，某一页出错只跳过该页，不让整份文档失败
const extractPagesTolerant = async (data: Uint8Array): Promise<PageText[]> => {
  const pdf = await getDocumentProxy(data);
  const pages: PageText[] = [];
  for (let number = 1; number <= pdf.numPages; number++) {
    try {
      const content = await (await pdf.getPage(number)).getTextContent();
      const text = content.items.map((item) => ("str" in item ? item.str + (item.hasEOL ? "\n" : "") : "")).join("");
      pages.push({ page: number, text });
    } catch {
      pages.push({ page: number, text: "" });
    }
  }
  return pages;
};

// 提取到的文字少于这个字符数，就认为是扫描件
const SCANNED_THRESHOLD = 30;

const parsePdf = async (buffer: Buffer): Promise<PageText[]> => {
  const pdfData = stripPdfPrefix(buffer);
  if (!pdfData) throw new Error("PDF 解析失败：文件内容不是有效的 PDF");
  let pages: PageText[];
  try {
    // 每次都传拷贝：pdf.js 会转移（detach）传入的 ArrayBuffer，失败后不能再复用
    const { text } = await extractText(new Uint8Array(pdfData));
    pages = text.map((pageText, index) => ({ page: index + 1, text: pageText }));
  } catch (firstError) {
    try {
      pages = await extractPagesTolerant(new Uint8Array(pdfData));
    } catch {
      throw new Error(`PDF 解析失败：${pdfErrorMessage(firstError)}`);
    }
  }
  const chars = pages.reduce((sum, page) => sum + page.text.replace(/\s/g, "").length, 0);
  if (chars >= SCANNED_THRESHOLD || pages.length === 0) return pages;
  // OCR 依赖配置和数据库，按需加载，保证本文件能在没有环境变量的单元测试里使用
  return (await import("./ocr")).ocrPdfPages(pdfData, pages.length);
};

// PDF 按页返回并保留页码；TXT / Markdown / Word 没有页的概念，页码为 null
export const parseFile = async (filePath: string, mimeType: string): Promise<PageText[]> => {
  const buffer = await readFile(filePath);
  if (Object.values(IMAGE_MIMES).includes(mimeType)) {
    return [{ page: null, text: await (await import("./ocr")).ocrImage(buffer, mimeType) }];
  }
  if (mimeType === "application/pdf") return parsePdf(buffer);
  if (mimeType === DOCX_MIME) {
    try {
      const { value } = await mammoth.extractRawText({ buffer });
      return [{ page: null, text: value }];
    } catch (error) {
      throw new Error(`Word 解析失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return [{ page: null, text: decodeText(buffer) }];
};
