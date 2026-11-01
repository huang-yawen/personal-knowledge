// 进程内的失败次数限制：连续失败超过上限后冷却一段时间。服务重启会清空，单机部署够用
const MAX_FAILURES = 5;
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ENTRIES = 10_000;

type Entry = { failures: number; resetAt: number };
const entries = new Map<string, Entry>();

const live = (key: string) => {
  const entry = entries.get(key);
  if (entry && entry.resetAt <= Date.now()) {
    entries.delete(key);
    return undefined;
  }
  return entry;
};

export const isBlocked = (key: string) => (live(key)?.failures ?? 0) >= MAX_FAILURES;

export const recordFailure = (key: string) => {
  const entry = live(key);
  if (entry) {
    entry.failures += 1;
    return;
  }
  // 防止被大量不同的 key 撑爆内存：满了就丢弃最早的记录
  if (entries.size >= MAX_ENTRIES) entries.delete(entries.keys().next().value as string);
  entries.set(key, { failures: 1, resetAt: Date.now() + WINDOW_MS });
};

export const clearFailures = (key: string) => entries.delete(key);
