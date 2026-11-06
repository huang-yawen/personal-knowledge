import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { DOCX_MIME, parseFile, stripPdfPrefix } from "./parse";

// 手工构造的最小单页 PDF（Helvetica，文字 Hello PDF）
const buildPdf = () => {
  const content = "BT /F1 12 Tf 10 50 Td (Hello PDF, this sentence has enough characters to count as text.) Tj ET";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 100] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((object, index) => {
    offsets.push(body.length);
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) body += `${String(offset).padStart(10, "0")} 00000 n \n`;
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body, "latin1");
};

const writeTemp = async (name: string, data: Buffer) => {
  const file = path.join(await mkdtemp(path.join(tmpdir(), "pk-parse-")), name);
  await writeFile(file, data);
  return file;
};

test("stripPdfPrefix：文件头在前 1024 字节内都接受，并去掉前面的多余字节", () => {
  assert.equal(stripPdfPrefix(Buffer.from("hello")), null);
  const shifted = stripPdfPrefix(Buffer.concat([Buffer.from("\r\n junk "), buildPdf()]));
  assert.ok(shifted?.subarray(0, 5).toString() === "%PDF-");
  assert.equal(stripPdfPrefix(Buffer.concat([Buffer.alloc(2000), buildPdf()])), null);
});

test("正常 PDF 能提取文字和页码", async () => {
  const pages = await parseFile(await writeTemp("a.pdf", buildPdf()), "application/pdf");
  assert.equal(pages.length, 1);
  assert.equal(pages[0].page, 1);
  assert.match(pages[0].text, /Hello PDF/);
});

test("文件头前有多余字节的 PDF 也能解析", async () => {
  const data = Buffer.concat([Buffer.from("\r\n\r\n junk "), buildPdf()]);
  const pages = await parseFile(await writeTemp("b.pdf", data), "application/pdf");
  assert.match(pages[0].text, /Hello PDF/);
});

test("损坏的 PDF 给出明确的失败原因", async () => {
  const bad = buildPdf().subarray(0, 120);
  await assert.rejects(parseFile(await writeTemp("c.pdf", bad), "application/pdf"), /PDF 解析失败/);
  await assert.rejects(parseFile(await writeTemp("d.pdf", Buffer.from("not a pdf")), "application/pdf"), /不是有效的 PDF/);
});

test("不是 zip 的 docx 会报 Word 解析失败", async () => {
  await assert.rejects(parseFile(await writeTemp("e.docx", Buffer.from("PKxxxx")), DOCX_MIME), /Word 解析失败/);
});
