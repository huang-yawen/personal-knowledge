import path from "node:path";

// 缺少必填环境变量时直接报错，避免带着错误配置启动
const required = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`缺少环境变量 ${name}`);
  return value;
};

export const config = {
  port: Number(process.env.PORT ?? 3001),
  uploadDir: path.resolve(import.meta.dirname, "..", "uploads"),
  maxFileBytes: 20 * 1024 * 1024,
  maxDocsPerKnowledgeBase: 100,
  // 目前只有单用户，所有数据归属这个固定的开发用户
  devUserId: Number(process.env.DEV_USER_ID ?? 1),
  mysql: {
    host: process.env.MYSQL_HOST ?? "127.0.0.1",
    port: Number(process.env.MYSQL_PORT ?? 3306),
    user: required("MYSQL_USER"),
    password: process.env.MYSQL_PASSWORD ?? "",
    database: required("MYSQL_DATABASE"),
  },
};
