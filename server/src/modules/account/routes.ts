import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import path from "node:path";
import { Router } from "express";
import type { RowDataPacket } from "mysql2";
import { config } from "../../config";
import { pool } from "../../db";
import { clearSessionCookie } from "../auth/session";
import { currentUserId } from "../auth/context";
import { MAX_PASSWORD_CHARS, verifyPassword } from "../auth/password";
import { clearFailures, isBlocked, recordFailure } from "../auth/rate-limit";
import { deleteVectors } from "../rag/qdrant";
import { writeExportFile } from "./export";

export const accountRouter = Router();

// 导出个人数据（JSON）：账号信息、设置、知识库与文档元数据及分块文本、对话、笔记、轨迹。
// 不含密码哈希、会话和上传的原始文件。
// 先流式写到磁盘文件，写完再整份发送：内存占用与数据量无关，也不会把半个 JSON 发给用户
accountRouter.get("/export", async (_req, res) => {
  const userId = currentUserId();
  const date = new Date().toISOString().slice(0, 10);
  const fileName = `personal-knowledge-export-${date}.json`;
  const tempPath = path.join(config.tempDir, `export-${userId}-${randomUUID()}.json`);

  try {
    await writeExportFile(userId, tempPath);
  } catch (error) {
    console.error("导出个人数据失败", error);
    await rm(tempPath, { force: true }).catch(() => {});
    res.status(500).json({ error: "导出失败，请稍后重试" });
    return;
  }

  // 发送时同样是从磁盘流出去的，不会把文件读进内存；结束或出错都要删掉临时文件
  res.attachment(fileName).type("json");
  res.sendFile(tempPath, (error) => {
    void rm(tempPath, { force: true }).catch(() => {});
    if (error) console.error("发送导出文件失败", error);
  });
});

// 永久删除账号及全部数据：向量、数据库记录、上传的文件。需要输入密码确认
accountRouter.delete("/", async (req, res) => {
  const userId = currentUserId();
  const password = typeof req.body?.password === "string" ? (req.body.password as string) : "";
  const guardKey = `delete|${userId}`;
  if (isBlocked(guardKey)) {
    res.status(429).json({ error: "失败次数过多，请 15 分钟后再试" });
    return;
  }
  const [rows] = await pool.query<RowDataPacket[]>("SELECT password_hash, is_admin FROM users WHERE id = ?", [userId]);
  if (!rows[0] || password.length > MAX_PASSWORD_CHARS || !(await verifyPassword(password, rows[0].password_hash as string))) {
    recordFailure(guardKey);
    res.status(403).json({ error: "密码不正确" });
    return;
  }
  clearFailures(guardKey);
  // 至少保留一个管理员，否则没人能生成邀请码
  if (rows[0].is_admin) {
    const [others] = await pool.query<RowDataPacket[]>("SELECT COUNT(*) AS n FROM users WHERE is_admin = 1 AND id <> ?", [userId]);
    if (Number(others[0].n) === 0) {
      res.status(409).json({ error: "你是唯一的管理员，不能删除账号" });
      return;
    }
  }

  // 先删向量：向量库不可用时直接中止，不会留下数据库已删但向量残留的状态
  try {
    await deleteVectors("user_id", userId);
  } catch (error) {
    console.error("删除账号时清理向量失败", error);
    res.status(502).json({ error: "向量库暂时不可用，账号未删除，请稍后重试" });
    return;
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    // 文档、分块、消息、标签、来源等由外键级联删除；sessions、usage_logs、user_settings 随用户级联
    for (const table of ["knowledge_bases", "conversations", "notes", "activities"]) {
      await conn.query(`DELETE FROM ${table} WHERE user_id = ?`, [userId]);
    }
    await conn.query("DELETE FROM users WHERE id = ?", [userId]);
    await conn.commit();
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
  await rm(path.join(config.uploadDir, String(userId)), { recursive: true, force: true }).catch((error: unknown) =>
    console.error("删除账号时清理上传文件失败", error),
  );
  clearSessionCookie(res);
  res.status(204).end();
});
