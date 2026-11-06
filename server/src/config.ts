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
  retrieval: { topK: 5 },
  chat: { maxHistoryMessages: 10, maxAnswerTokens: 2000, maxMessageChars: 4000 },
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
