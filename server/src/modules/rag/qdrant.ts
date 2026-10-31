import { config } from "../../config";

const { url, collection } = config.qdrant;
const UPSERT_BATCH = 100;

export type ChunkPoint = {
  id: string;
  vector: number[];
  payload: { user_id: number; knowledge_base_id: number; document_id: number; chunk_id: number; page_number: number | null };
};

const request = async (method: string, path: string, body?: unknown) => {
  const response = await fetch(`${url}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  return response;
};

const failed = async (action: string, response: Response) =>
  new Error(`Qdrant ${action}失败（HTTP ${response.status}）：${(await response.text()).slice(0, 200)}`);

type CollectionInfo = {
  result: { config: { params: { vectors: { size?: number; [name: string]: unknown } } } };
};

const init = async () => {
  const response = await request("GET", `/collections/${collection}`);
  if (response.status === 404) {
    const created = await request("PUT", `/collections/${collection}`, {
      vectors: { size: config.embedding.dimensions, distance: "Cosine" },
    });
    if (!created.ok) throw await failed("创建集合", created);
    // 检索时总是先按用户和知识库过滤，给这些字段建索引
    for (const field of ["user_id", "knowledge_base_id", "document_id"]) {
      const indexed = await request("PUT", `/collections/${collection}/index?wait=true`, {
        field_name: field,
        field_schema: "integer",
      });
      if (!indexed.ok) throw await failed("创建索引", indexed);
    }
    return;
  }
  if (!response.ok) throw await failed("读取集合", response);

  // 已有集合时确认向量维度一致，避免换了 Embedding 模型后写入失败或结果错乱
  const { vectors } = ((await response.json()) as CollectionInfo).result.config.params;
  const size = typeof vectors.size === "number" ? vectors.size : (vectors[""] as { size?: number } | undefined)?.size;
  if (size !== config.embedding.dimensions) {
    throw new Error(`Qdrant 集合维度为 ${size}，与配置的 ${config.embedding.dimensions} 不一致，请重建集合`);
  }
};

let ready: Promise<void> | undefined;

// 集合只初始化一次；失败时清掉缓存，下次调用重试
export const ensureCollection = () => {
  ready ??= init().catch((error: unknown) => {
    ready = undefined;
    throw error;
  });
  return ready;
};

export const upsertPoints = async (points: ChunkPoint[]) => {
  await ensureCollection();
  for (let i = 0; i < points.length; i += UPSERT_BATCH) {
    const response = await request("PUT", `/collections/${collection}/points?wait=true`, {
      points: points.slice(i, i + UPSERT_BATCH),
    });
    if (!response.ok) throw await failed("写入向量", response);
  }
};

// 按文档或知识库删除向量
export const deleteVectors = async (field: "document_id" | "knowledge_base_id", id: number) => {
  await ensureCollection();
  const response = await request("POST", `/collections/${collection}/points/delete?wait=true`, {
    filter: { must: [{ key: field, match: { value: id } }] },
  });
  if (!response.ok) throw await failed("删除向量", response);
};
