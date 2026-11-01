import path from "node:path";

// 缺少必填环境变量时直接报错，避免带着错误配置启动
const required = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`缺少环境变量 ${name}`);
  return value;
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
  retrieval: { topK: 5 },
  chat: { maxHistoryMessages: 10, maxAnswerTokens: 2000, maxMessageChars: 4000 },
  qdrant: {
    url: required("QDRANT_URL").replace(/\/+$/, ""),
    collection: "personal_knowledge_chunks",
  },
  uploadDir: path.resolve(import.meta.dirname, "..", "uploads"),
  maxFileBytes: 20 * 1024 * 1024,
  maxDocsPerKnowledgeBase: 100,
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
