import { getDocumentProxy, renderPageAsImage } from "unpdf";
import { config } from "../../config";
import { currentUserId } from "../auth/context";
import { recordUsage, todayTokens } from "../usage";
import type { PageText } from "./parse";

const PROMPT =
  "请逐字识别图片中的全部文字，保持原有段落；表格用 Markdown 表格输出。只输出识别出的文字，不要任何解释。如果图片里没有文字，输出空内容。";

type ChatResponse = { choices?: { message?: { content?: string | null } }[]; usage?: { total_tokens?: number } };

const callVision = async (model: string, dataUrl: string): Promise<string> => {
  const response = await fetch(`${config.embedding.baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.embedding.apiKey}` },
    body: JSON.stringify({
      model,
      temperature: 0,
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: dataUrl } },
            { type: "text", text: PROMPT },
          ],
        },
      ],
    }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!response.ok) throw new Error(`OCR 请求失败（${response.status}）：${(await response.text()).slice(0, 200)}`);
  const data = (await response.json()) as ChatResponse;
  recordUsage("ocr", data.usage?.total_tokens);
  return (data.choices?.[0]?.message?.content ?? "").trim();
};

// 识别一张图片里的文字。需要在用户上下文（runAsUser）里调用，用于额度判断和记账
export const ocrImage = async (image: Uint8Array, mime: string): Promise<string> => {
  if ((await todayTokens(currentUserId())) >= config.limits.dailyTokens) {
    throw new Error("今日模型额度已用完，请明天点“重试”再处理");
  }
  const dataUrl = `data:${mime};base64,${Buffer.from(image).toString("base64")}`;
  try {
    const text = await callVision(config.ocr.model, dataUrl);
    if (text) return text;
  } catch (error) {
    console.error("OCR 主模型失败，改用备用模型", error instanceof Error ? error.message : error);
  }
  // 主模型出错或返回空：用更大的备用模型再试一次，仍失败则把错误抛给上层
  return callVision(config.ocr.fallbackModel, dataUrl);
};

// 扫描件：把每页渲染成图片再 OCR。页数过多直接拒绝，不静默丢内容
export const ocrPdfPages = async (pdfData: Buffer, pageCount: number): Promise<PageText[]> => {
  if (pageCount > config.ocr.maxPdfPages) {
    throw new Error(`这是扫描版 PDF，共 ${pageCount} 页，超过 OCR 上限 ${config.ocr.maxPdfPages} 页，请拆分后再上传`);
  }
  const pdf = await getDocumentProxy(new Uint8Array(pdfData));
  const pages: PageText[] = [];
  for (let number = 1; number <= pageCount; number++) {
    const image = await renderPageAsImage(pdf, number, { canvasImport: () => import("@napi-rs/canvas"), scale: 2 });
    pages.push({ page: number, text: await ocrImage(image, "image/png") });
  }
  return pages;
};
