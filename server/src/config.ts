// 缺少必填环境变量时直接报错，避免带着错误配置启动
const required = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`缺少环境变量 ${name}`);
  return value;
};

export const config = {
  port: Number(process.env.PORT ?? 3001),
  mysql: {
    host: process.env.MYSQL_HOST ?? "127.0.0.1",
    port: Number(process.env.MYSQL_PORT ?? 3306),
    user: required("MYSQL_USER"),
    password: process.env.MYSQL_PASSWORD ?? "",
    database: required("MYSQL_DATABASE"),
  },
};
