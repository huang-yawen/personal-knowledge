import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

const KEY_LENGTH = 64;
export const MIN_PASSWORD_CHARS = 8;
export const MAX_PASSWORD_CHARS = 128;

const derive = (password: string, salt: Buffer, length: number) =>
  new Promise<Buffer>((resolve, reject) =>
    scrypt(password, salt, length, (error, key) => (error ? reject(error) : resolve(key))),
  );

// 存储格式：scrypt$盐$哈希（均为 base64）
export const hashPassword = async (password: string) => {
  const salt = randomBytes(16);
  const key = await derive(password, salt, KEY_LENGTH);
  return `scrypt$${salt.toString("base64")}$${key.toString("base64")}`;
};

export const verifyPassword = async (password: string, stored: string) => {
  const [scheme, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64");
  const actual = await derive(password, Buffer.from(salt, "base64"), expected.length);
  return timingSafeEqual(actual, expected);
};

// 用户不存在时也做一次同样耗时的计算，避免通过响应时间判断用户名是否存在
let dummyHash: Promise<string> | undefined;
export const spendDummyVerification = async (password: string) => {
  dummyHash ??= hashPassword("dummy-password");
  await verifyPassword(password, await dummyHash);
};
