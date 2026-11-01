import { randomUUID } from "node:crypto";
import { mkdir, open, rm } from "node:fs/promises";
import path from "node:path";
import { Router, type Request, type Response } from "express";
import multer from "multer";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { config } from "../../config";
import { pool } from "../../db";
import { parseId } from "../knowledge-base/routes";
import { recordActivity } from "../activity/repository";
import { removeDocument } from "./remove";
import { enqueue } from "../worker/queue";

// 只信扩展名，MIME 由服务端按扩展名确定，不使用客户端传来的值
const fileTypes: Record<string, { label: string; mime: string }> = {
  ".pdf": { label: "PDF", mime: "application/pdf" },
  ".txt": { label: "TXT", mime: "text/plain" },
  ".md": { label: "MD", mime: "text/markdown" },
};

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

type DocumentRow = RowDataPacket & {
  id: number;
  knowledgeBaseId: number;
  name: string;
  mimeType: string;
  sizeBytes: number;
  status: string;
  errorMessage: string | null;
  sourceNoteId: number | null;
  createdAt: Date;
  updatedAt: Date;
};

const documentColumns = `id, knowledge_base_id AS knowledgeBaseId, original_name AS name, mime_type AS mimeType,
  size_bytes AS sizeBytes, status, error_message AS errorMessage, source_note_id AS sourceNoteId, created_at AS createdAt, updated_at AS updatedAt`;

const knowledgeBaseExists = async (id: number) => {
  const [rows] = await pool.query<RowDataPacket[]>("SELECT id FROM knowledge_bases WHERE id = ? AND user_id = ?", [
    id,
    config.devUserId,
  ]);
  return rows.length > 0;
};

// 文件落盘到 uploads/<用户>/<知识库>/，磁盘上用随机名，原始文件名只存数据库
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, _file, cb) => {
      const dir = path.join(config.uploadDir, String(config.devUserId), String(req.params.id));
      mkdir(dir, { recursive: true }).then(
        () => cb(null, dir),
        (error: Error) => cb(error, dir),
      );
    },
    filename: (_req, file, cb) => cb(null, randomUUID() + path.extname(file.originalname).toLowerCase()),
  }),
  limits: { fileSize: config.maxFileBytes, files: 1 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext in fileTypes) cb(null, true);
    else cb(new HttpError(400, "仅支持 PDF、TXT、Markdown 文件"));
  },
});

const receiveFile = (req: Request, res: Response) =>
  new Promise<void>((resolve, reject) => {
    upload.single("file")(req, res, (error: unknown) => (error ? reject(error) : resolve()));
  });

// 删除已落盘但最终被拒绝的文件
const discard = (file: Express.Multer.File) => rm(file.path, { force: true });

export const documentRouter = Router();

documentRouter.get("/knowledge-bases/:id/documents", async (req, res) => {
  const kbId = parseId(req.params.id);
  if (!kbId || !(await knowledgeBaseExists(kbId))) {
    res.status(404).json({ error: "知识库不存在" });
    return;
  }
  const [rows] = await pool.query<DocumentRow[]>(
    `SELECT ${documentColumns} FROM documents WHERE knowledge_base_id = ? AND user_id = ? ORDER BY created_at DESC, id DESC`,
    [kbId, config.devUserId],
  );
  res.json(rows);
});

documentRouter.post("/knowledge-bases/:id/documents", async (req, res) => {
  const kbId = parseId(req.params.id);
  if (!kbId || !(await knowledgeBaseExists(kbId))) {
    res.status(404).json({ error: "知识库不存在" });
    return;
  }
  const [count] = await pool.query<RowDataPacket[]>("SELECT COUNT(*) AS total FROM documents WHERE knowledge_base_id = ?", [
    kbId,
  ]);
  if (Number(count[0].total) >= config.maxDocsPerKnowledgeBase) {
    res.status(409).json({ error: `每个知识库最多 ${config.maxDocsPerKnowledgeBase} 个文件` });
    return;
  }

  try {
    await receiveFile(req, res);
  } catch (error) {
    if (error instanceof multer.MulterError) {
      const message =
        error.code === "LIMIT_FILE_SIZE"
          ? `文件不能超过 ${config.maxFileBytes / 1024 / 1024}MB`
          : "请使用 file 字段上传单个文件";
      res.status(error.code === "LIMIT_FILE_SIZE" ? 413 : 400).json({ error: message });
      return;
    }
    if (error instanceof HttpError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    throw error;
  }

  const file = req.file;
  if (!file) {
    res.status(400).json({ error: "请选择要上传的文件" });
    return;
  }

  const ext = path.extname(file.originalname).toLowerCase();
  if (ext === ".pdf") {
    // 扩展名可以伪造，再检查 PDF 文件头
    const handle = await open(file.path, "r");
    const header = Buffer.alloc(5);
    await handle.read(header, 0, 5, 0);
    await handle.close();
    if (header.toString("latin1") !== "%PDF-") {
      await discard(file);
      res.status(400).json({ error: "文件内容不是有效的 PDF" });
      return;
    }
  }

  // multer 把文件名按 latin1 解码，中文会乱码，这里还原成 UTF-8
  const originalName = Buffer.from(file.originalname, "latin1").toString("utf8");
  try {
    const [result] = await pool.query<ResultSetHeader>(
      `INSERT INTO documents (user_id, knowledge_base_id, original_name, stored_path, mime_type, size_bytes)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        config.devUserId,
        kbId,
        originalName,
        path.relative(config.uploadDir, file.path),
        fileTypes[ext].mime,
        file.size,
      ],
    );
    const [created] = await pool.query<DocumentRow[]>(`SELECT ${documentColumns} FROM documents WHERE id = ?`, [
      result.insertId,
    ]);
    await recordActivity(config.devUserId, "doc_uploaded", originalName, result.insertId);
    enqueue(result.insertId);
    res.status(201).json(created[0]);
  } catch (error) {
    // 入库失败时不留下孤立文件
    await discard(file);
    throw error;
  }
});

documentRouter.delete("/documents/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (!id || !(await removeDocument(id))) {
    res.status(404).json({ error: "文档不存在" });
    return;
  }
  res.status(204).end();
});

// 阅读视图：返回文档信息和全部分块（按原文顺序），引用卡片靠 chunk id 定位到其中一段
documentRouter.get("/documents/:id/chunks", async (req, res) => {
  const id = parseId(req.params.id);
  const [docs] = id
    ? await pool.query<DocumentRow[]>(`SELECT ${documentColumns} FROM documents WHERE id = ? AND user_id = ?`, [
        id,
        config.devUserId,
      ])
    : [[]];
  if (!id || docs.length === 0) {
    res.status(404).json({ error: "文档不存在" });
    return;
  }
  const [chunks] = await pool.query<RowDataPacket[]>(
    `SELECT id, chunk_index AS chunkIndex, content, page_number AS page
     FROM document_chunks WHERE document_id = ? AND user_id = ? ORDER BY chunk_index`,
    [id, config.devUserId],
  );
  res.json({ document: docs[0], chunks });
});

// 失败重试：只允许处理失败的文档，重置状态后重新进入处理队列
documentRouter.post("/documents/:id/retry", async (req, res) => {
  const id = parseId(req.params.id);
  const [result] = id
    ? await pool.query<ResultSetHeader>(
        "UPDATE documents SET status = 'pending', error_message = NULL WHERE id = ? AND user_id = ? AND status = 'failed'",
        [id, config.devUserId],
      )
    : [undefined];
  if (!id || !result || result.affectedRows === 0) {
    res.status(404).json({ error: "文档不存在或不是失败状态" });
    return;
  }
  enqueue(id);
  const [rows] = await pool.query<DocumentRow[]>(`SELECT ${documentColumns} FROM documents WHERE id = ?`, [id]);
  res.json(rows[0]);
});

// 重命名只改显示名称（original_name），磁盘上的随机文件名不变；已保存的引用快照保持当时的名字
documentRouter.patch("/documents/:id", async (req, res) => {
  const id = parseId(req.params.id);
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  if (!name || name.length > 255) {
    res.status(400).json({ error: "名称不能为空，且不超过 255 个字符" });
    return;
  }
  // 来自笔记的文档名称跟随笔记标题，在这里改会在下次同步时被覆盖
  const [fromNote] = id
    ? await pool.query<RowDataPacket[]>("SELECT id FROM documents WHERE id = ? AND user_id = ? AND source_note_id IS NOT NULL", [
        id,
        config.devUserId,
      ])
    : [[]];
  if (fromNote.length > 0) {
    res.status(409).json({ error: "来自笔记的文档请在笔记里修改标题" });
    return;
  }
  const [result] = id
    ? await pool.query<ResultSetHeader>("UPDATE documents SET original_name = ? WHERE id = ? AND user_id = ?", [
        name,
        id,
        config.devUserId,
      ])
    : [undefined];
  if (!id || !result || result.affectedRows === 0) {
    res.status(404).json({ error: "文档不存在" });
    return;
  }
  const [rows] = await pool.query<DocumentRow[]>(`SELECT ${documentColumns} FROM documents WHERE id = ?`, [id]);
  res.json(rows[0]);
});
