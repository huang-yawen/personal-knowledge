import { readFile } from "node:fs/promises";
import mammoth from "mammoth";
import { extractText, getDocumentProxy } from "unpdf";

export type PageText = { page: number | null; text: string };

export const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

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

const parsePdf = async (buffer: Buffer): Promise<PageText[]> => {
  const pdfData = stripPdfPrefix(buffer);
  if (!pdfData) throw new Error("PDF 解析失败：文件内容不是有效的 PDF");
  try {
    // 每次都传拷贝：pdf.js 会转移（detach）传入的 ArrayBuffer，失败后不能再复用
    const { text } = await extractText(new Uint8Array(pdfData));
    return text.map((pageText, index) => ({ page: index + 1, text: pageText }));
  } catch (firstError) {
    try {
      return await extractPagesTolerant(new Uint8Array(pdfData));
    } catch {
      throw new Error(`PDF 解析失败：${pdfErrorMessage(firstError)}`);
    }
  }
};

// PDF 按页返回并保留页码；TXT / Markdown / Word 没有页的概念，页码为 null
export const parseFile = async (filePath: string, mimeType: string): Promise<PageText[]> => {
  const buffer = await readFile(filePath);
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
