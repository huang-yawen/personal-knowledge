import type { RowDataPacket } from "mysql2";
import { config } from "../../config";
import { pool } from "../../db";
import { currentUserId } from "../auth/context";

export const REPLY_STYLES = ["concise", "balanced", "detailed"] as const;
export type ReplyStyle = (typeof REPLY_STYLES)[number];
export const MAX_TOP_K = 10;

// strictMode：只依据知识库资料回答，资料不足时明确说明，不使用模型自身知识
export type Settings = { replyStyle: ReplyStyle; topK: number; defaultKnowledgeBaseIds: number[]; strictMode: boolean };

// 读取当前用户的偏好；没设置过用默认值，默认知识库里已被删除的会被过滤掉
export const getSettings = async (): Promise<Settings> => {
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT reply_style, top_k, default_kb_ids, strict_mode FROM user_settings WHERE user_id = ?",
    [currentUserId()],
  );
  const row = rows[0];
  const saved: unknown = row?.default_kb_ids;
  const ids = Array.isArray(saved) ? saved.filter((id): id is number => typeof id === "number") : [];
  let existing: number[] = [];
  if (ids.length > 0) {
    const [kbs] = await pool.query<RowDataPacket[]>("SELECT id FROM knowledge_bases WHERE user_id = ? AND id IN (?)", [
      currentUserId(),
      ids,
    ]);
    existing = kbs.map((kb) => kb.id as number);
  }
  return {
    replyStyle: REPLY_STYLES.includes(row?.reply_style) ? (row.reply_style as ReplyStyle) : "balanced",
    topK: row ? Number(row.top_k) : config.retrieval.topK,
    defaultKnowledgeBaseIds: existing,
    strictMode: Boolean(row?.strict_mode),
  };
};

export const saveSettings = async (settings: Settings) => {
  await pool.query(
    `INSERT INTO user_settings (user_id, reply_style, top_k, default_kb_ids, strict_mode) VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE reply_style = VALUES(reply_style), top_k = VALUES(top_k), default_kb_ids = VALUES(default_kb_ids),
       strict_mode = VALUES(strict_mode)`,
    [currentUserId(), settings.replyStyle, settings.topK, JSON.stringify(settings.defaultKnowledgeBaseIds), settings.strictMode ? 1 : 0],
  );
};
