import { rm } from "node:fs/promises";
import path from "node:path";
import { Router } from "express";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { config } from "../../config";
import { pool } from "../../db";
import { deleteVectors } from "../rag/qdrant";

type KnowledgeBaseRow = RowDataPacket & {
  id: number;
  name: string;
  description: string;
  createdAt: Date;
  updatedAt: Date;
  documentCount: number;
};

// 查询知识库及其文档数；所有查询都带 user_id，避免越权读取
const fetchKnowledgeBases = async (options: { id?: number; q?: string } = {}) => {
  const conditions = ["kb.user_id = ?"];
  const params: (number | string)[] = [config.devUserId];
  if (options.id !== undefined) {
    conditions.push("kb.id = ?");
    params.push(options.id);
  }
  if (options.q) {
    // 转义 LIKE 通配符，让用户输入的 % 和 _ 按字面匹配
    const like = `%${options.q.replace(/[\\%_]/g, "\\$&")}%`;
    conditions.push("(kb.name LIKE ? OR kb.description LIKE ?)");
    params.push(like, like);
  }
  const [rows] = await pool.query<KnowledgeBaseRow[]>(
    `SELECT kb.id, kb.name, kb.description, kb.created_at AS createdAt, kb.updated_at AS updatedAt,
            COUNT(d.id) AS documentCount
     FROM knowledge_bases kb
     LEFT JOIN documents d ON d.knowledge_base_id = kb.id
     WHERE ${conditions.join(" AND ")}
     GROUP BY kb.id
     ORDER BY kb.updated_at DESC, kb.id DESC`,
    params,
  );
  return rows.map((row) => ({ ...row, documentCount: Number(row.documentCount) }));
};

type Fields = { name?: string; description?: string };

// 校验请求体，返回字段或错误文案
const parseBody = (body: unknown, requireName: boolean): Fields | string => {
  const input = (typeof body === "object" && body !== null ? body : {}) as Record<string, unknown>;
  const fields: Fields = {};
  if (input.name !== undefined || requireName) {
    if (typeof input.name !== "string" || !input.name.trim()) return "名称不能为空";
    if (input.name.trim().length > 100) return "名称不能超过 100 个字符";
    fields.name = input.name.trim();
  }
  if (input.description !== undefined) {
    if (typeof input.description !== "string") return "描述格式不正确";
    if (input.description.trim().length > 500) return "描述不能超过 500 个字符";
    fields.description = input.description.trim();
  }
  if (!requireName && fields.name === undefined && fields.description === undefined) return "没有需要修改的内容";
  return fields;
};

export const parseId = (value: string) => {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : undefined;
};

export const knowledgeBaseRouter = Router();

knowledgeBaseRouter.get("/", async (req, res) => {
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  res.json(await fetchKnowledgeBases({ q }));
});

knowledgeBaseRouter.post("/", async (req, res) => {
  const fields = parseBody(req.body, true);
  if (typeof fields === "string") {
    res.status(400).json({ error: fields });
    return;
  }
  const [result] = await pool.query<ResultSetHeader>(
    "INSERT INTO knowledge_bases (user_id, name, description) VALUES (?, ?, ?)",
    [config.devUserId, fields.name, fields.description ?? ""],
  );
  const [created] = await fetchKnowledgeBases({ id: result.insertId });
  res.status(201).json(created);
});

knowledgeBaseRouter.patch("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  const [existing] = id ? await fetchKnowledgeBases({ id }) : [];
  if (!id || !existing) {
    res.status(404).json({ error: "知识库不存在" });
    return;
  }
  const fields = parseBody(req.body, false);
  if (typeof fields === "string") {
    res.status(400).json({ error: fields });
    return;
  }
  await pool.query("UPDATE knowledge_bases SET name = ?, description = ? WHERE id = ? AND user_id = ?", [
    fields.name ?? existing.name,
    fields.description ?? existing.description,
    id,
    config.devUserId,
  ]);
  const [updated] = await fetchKnowledgeBases({ id });
  res.json(updated);
});

knowledgeBaseRouter.delete("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  const [result] = id
    ? await pool.query<ResultSetHeader>("DELETE FROM knowledge_bases WHERE id = ? AND user_id = ?", [id, config.devUserId])
    : [undefined];
  if (!result || result.affectedRows === 0) {
    res.status(404).json({ error: "知识库不存在" });
    return;
  }
  // 记录由外键级联删除，磁盘上的文件需要单独清理
  await rm(path.join(config.uploadDir, String(config.devUserId), String(id)), { recursive: true, force: true });
  await deleteVectors("knowledge_base_id", id as number).catch((error: unknown) => console.error("删除向量失败", error));
  res.status(204).end();
});
