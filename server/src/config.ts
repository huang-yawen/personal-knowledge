import path from "node:path";

// 缺少必填环境变量时直接报错，避免带着错误配置启动
const required = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`缺少环境变量 ${name}`);
  return value;
};

// 可选的数值型环境变量：未设置或不是正整数时用默认值
const numberEnv = (name: string, fallback: number): number => {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
};

// 0 到 1 之间的比例型环境变量（如检索相似度下限）：0 是有效值（表示不启用），非法值用默认值
const ratioEnv = (name: string, fallback: number): number => {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 && value <= 1 ? value : fallback;
};

// 可选数值：未设置或非法返回 undefined（表示不启用该限制）。允许负数，因为 rerank 分数可能是 logit
const optionalNumberEnv = (name: string): number | undefined => {
  const raw = process.env[name]?.trim();
  if (!raw) return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
};

export const config = {
  port: Number(process.env.PORT ?? 3001),
  embedding: {
    apiKey: required("EMBEDDING_API_KEY"),
    baseUrl: required("EMBEDDING_BASE_URL").replace(/\/+$/, ""),
    model: required("EMBEDDING_MODEL"),
    dimensions: Number(required("EMBEDDING_DIMENSIONS")),
  },
  deepseek: {
    apiKey: required("DEEPSEEK_API_KEY"),
    baseUrl: required("DEEPSEEK_BASE_URL").replace(/\/+$/, ""),
    model: required("DEEPSEEK_MODEL"),
  },
  // 图片 / 扫描件 OCR：复用硅基流动的密钥，主模型出错或返回空时用备用模型再试一次
  ocr: {
    model: process.env.OCR_MODEL ?? "Qwen/Qwen3-VL-8B-Instruct",
    fallbackModel: process.env.OCR_FALLBACK_MODEL ?? "Qwen/Qwen3-VL-32B-Instruct",
    maxPdfPages: numberEnv("OCR_MAX_PDF_PAGES", 30),
    maxImageBytes: 10 * 1024 * 1024,
  },
  retrieval: {
    topK: 5,
    // 相似度下限：低于该分数的检索结果不会进入提示词。bge-m3 的分布偏高，这个值需要用真实问题标定
    // （问答日志里的 scores 字段记录了每次实际分数），0 表示不过滤
    minScore: ratioEnv("RETRIEVAL_MIN_SCORE", 0.35),
    // 开启精排时用更宽松的召回下限：别在精排前就把可能相关的资料误杀
    recallMinScore: ratioEnv("RETRIEVAL_RECALL_MIN_SCORE", 0.2),
  },
  // 精排：向量召回后用一个 cross-encoder 重新排序，决定哪些资料真正进入提示词
  rerank: {
    enabled: process.env.RERANK_ENABLED === "true",
    // 影子模式：照常调用并记录分数，但最终结果仍用向量排序，用来先摸清分数分布
    shadow: process.env.RERANK_SHADOW === "true",
    model: process.env.RERANK_MODEL ?? "BAAI/bge-reranker-v2-m3",
    // 默认复用 embedding 的地址和密钥（同一个硅基流动账号，不用新增配置）
    baseUrl: (process.env.RERANK_BASE_URL ?? required("EMBEDDING_BASE_URL")).replace(/\/+$/, ""),
    apiKey: process.env.RERANK_API_KEY ?? required("EMBEDDING_API_KEY"),
    // 精排分数阈值：rerank 分数可能是 logit（有正有负、无上界），所以不能用限制 0~1 的 ratioEnv。
    // 未设置表示不过滤，建议先用影子模式看真实分布再定
    minScore: optionalNumberEnv("RERANK_MIN_SCORE"),
    candidates: numberEnv("RERANK_CANDIDATES", 20),
    maxCandidates: numberEnv("RERANK_MAX_CANDIDATES", 50),
    timeoutMs: numberEnv("RERANK_TIMEOUT_MS", 5000),
  },
  chat: {
    maxHistoryMessages: 10,
    maxAnswerTokens: 2000,
    maxMessageChars: 4000,
    // 长对话滚动摘要：超出 maxHistoryMessages 的早期消息压缩成摘要，避免长对话丢失前文
    summaryMaxChars: 800,
    // 已有摘要后，至少要再累积这么多条待压缩消息才重新总结，避免每轮都调一次模型
    summaryMinMessages: 6,
    // 送进摘要模型的新增对话字数上限
    summaryInputChars: 6000,
  },
  qdrant: {
    url: required("QDRANT_URL").replace(/\/+$/, ""),
    collection: "personal_knowledge_chunks",
  },
  uploadDir: path.resolve(import.meta.dirname, "..", "uploads"),
  maxFileBytes: 20 * 1024 * 1024,
  maxDocsPerKnowledgeBase: 100,
  // 每用户的限流与额度，均可用环境变量调整
  limits: {
    chatPerMinute: numberEnv("LIMIT_CHAT_PER_MINUTE", 20),
    aiPerMinute: numberEnv("LIMIT_AI_PER_MINUTE", 10),
    uploadPerMinute: numberEnv("LIMIT_UPLOAD_PER_MINUTE", 10),
    apiPerMinute: numberEnv("LIMIT_API_PER_MINUTE", 300),
    dailyTokens: numberEnv("LIMIT_DAILY_TOKENS", 200_000),
    maxDocsPerUser: numberEnv("LIMIT_DOCS_PER_USER", 100),
    maxBytesPerUser: numberEnv("LIMIT_MB_PER_USER", 200) * 1024 * 1024,
  },
  // 账户系统接入前的固定用户 id：第一个注册的账号沿用这个 id，从而自动接管已有数据
  legacyUserId: Number(process.env.DEV_USER_ID ?? 1),
  mysql: {
    host: process.env.MYSQL_HOST ?? "127.0.0.1",
    port: Number(process.env.MYSQL_PORT ?? 3306),
    user: required("MYSQL_USER"),
    password: process.env.MYSQL_PASSWORD ?? "",
    database: required("MYSQL_DATABASE"),
  },
};
