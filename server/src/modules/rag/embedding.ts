import { config } from "../../config";

const BATCH_SIZE = 16;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type EmbeddingResponse = { data: { index: number; embedding: number[] }[] };

const requestEmbeddings = async (input: string[]): Promise<number[][]> => {
  for (let attempt = 1; ; attempt++) {
    let response: Response;
    try {
      response = await fetch(`${config.embedding.baseUrl}/embeddings`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.embedding.apiKey}` },
        body: JSON.stringify({ model: config.embedding.model, input }),
        signal: AbortSignal.timeout(60_000),
      });
    } catch (error) {
      // 网络抖动（连接超时、连接被重置等）时重试；仍失败则带上具体原因，方便定位
      if (attempt < 3) {
        await sleep(1000 * attempt);
        continue;
      }
      const code = (error as { cause?: { code?: string } }).cause?.code;
      throw new Error(`Embedding 网络请求失败${code ? `（${code}）` : ""}：${error instanceof Error ? error.message : String(error)}`);
    }
    if (response.ok) {
      const body = (await response.json()) as EmbeddingResponse;
      return body.data.sort((a, b) => a.index - b.index).map((item) => item.embedding);
    }
    // 限流或服务端错误时稍后重试，其余错误（如 key 无效）直接失败
    if ((response.status === 429 || response.status >= 500) && attempt < 3) {
      await sleep(1000 * attempt);
      continue;
    }
    throw new Error(`Embedding 请求失败（HTTP ${response.status}）：${(await response.text()).slice(0, 200)}`);
  }
};

// 批量生成向量，返回顺序与输入一致
export const embedTexts = async (texts: string[]): Promise<number[][]> => {
  const vectors: number[][] = [];
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    vectors.push(...(await requestEmbeddings(texts.slice(i, i + BATCH_SIZE))));
  }
  if (vectors.length !== texts.length || vectors.some((vector) => vector.length !== config.embedding.dimensions)) {
    throw new Error(`Embedding 返回的向量数量或维度与配置（${config.embedding.dimensions} 维）不一致`);
  }
  return vectors;
};
