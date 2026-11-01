import { Router } from "express";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { config } from "../../config";
import { pool } from "../../db";
import { parseId } from "../knowledge-base/routes";

const MAX_TITLE_CHARS = 100;
const MAX_CONTENT_CHARS = 200_000;

const detailColumns = "id, title, content, category, created_at AS createdAt, updated_at AS updatedAt";

const fetchNote = async (id: number) => {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT ${detailColumns} FROM notes WHERE id = ? AND user_id = ?`,
    [id, config.devUserId],
  );
  return rows[0];
};

export const noteRouter = Router();

// 列表只返回正文开头的预览，完整内容用详情接口读取；q 匹配标题和正文
noteRouter.get("/", async (req, res) => {
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const conditions = ["user_id = ?"];
  const params: (number | string)[] = [config.devUserId];
  if (q) {
    // 转义 LIKE 通配符，让用户输入的 % 和 _ 按字面匹配
    const like = `%${q.replace(/[\\%_]/g, "\\$&")}%`;
    conditions.push("(title LIKE ? OR content LIKE ?)");
    params.push(like, like);
  }
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT id, title, LEFT(content, 200) AS preview, category, created_at AS createdAt, updated_at AS updatedAt
     FROM notes WHERE ${conditions.join(" AND ")} ORDER BY updated_at DESC, id DESC LIMIT 200`,
    params,
  );
  res.json(rows);
});

noteRouter.get("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  const note = id ? await fetchNote(id) : undefined;
  if (!note) {
    res.status(404).json({ error: "笔记不存在" });
    return;
  }
  res.json(note);
});

// 新建：标题、正文均可不传，标题默认“未命名笔记”
noteRouter.post("/", async (req, res) => {
  const body = (typeof req.body === "object" && req.body !== null ? req.body : {}) as Record<string, unknown>;
  const title = body.title === undefined ? "未命名笔记" : typeof body.title === "string" ? body.title.trim() : "";
  const content = body.content === undefined ? "" : body.content;
  if (!title || Array.from(title).length > MAX_TITLE_CHARS) {
    res.status(400).json({ error: `标题不能为空，且不超过 ${MAX_TITLE_CHARS} 个字符` });
    return;
  }
  if (typeof content !== "string" || content.length > MAX_CONTENT_CHARS) {
    res.status(400).json({ error: `正文不超过 ${MAX_CONTENT_CHARS} 个字符` });
    return;
  }
  const [result] = await pool.query<ResultSetHeader>("INSERT INTO notes (user_id, title, content) VALUES (?, ?, ?)", [
    config.devUserId,
    title,
    content,
  ]);
  res.status(201).json(await fetchNote(result.insertId));
});

// 自动保存：title、content 都是可选的，只更新传入的字段
noteRouter.patch("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  const body = (typeof req.body === "object" && req.body !== null ? req.body : {}) as Record<string, unknown>;
  const sets: string[] = [];
  const params: string[] = [];
  if (body.title !== undefined) {
    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (!title || Array.from(title).length > MAX_TITLE_CHARS) {
      res.status(400).json({ error: `标题不能为空，且不超过 ${MAX_TITLE_CHARS} 个字符` });
      return;
    }
    sets.push("title = ?");
    params.push(title);
  }
  if (body.content !== undefined) {
    if (typeof body.content !== "string" || body.content.length > MAX_CONTENT_CHARS) {
      res.status(400).json({ error: `正文不超过 ${MAX_CONTENT_CHARS} 个字符` });
      return;
    }
    sets.push("content = ?");
    params.push(body.content);
  }
  if (sets.length === 0) {
    res.status(400).json({ error: "没有需要修改的内容" });
    return;
  }
  const [result] = id
    ? await pool.query<ResultSetHeader>(`UPDATE notes SET ${sets.join(", ")} WHERE id = ? AND user_id = ?`, [
        ...params,
        id,
        config.devUserId,
      ])
    : [undefined];
  if (!id || !result || result.affectedRows === 0) {
    res.status(404).json({ error: "笔记不存在" });
    return;
  }
  res.json(await fetchNote(id));
});

noteRouter.delete("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  const [result] = id
    ? await pool.query<ResultSetHeader>("DELETE FROM notes WHERE id = ? AND user_id = ?", [id, config.devUserId])
    : [undefined];
  if (!result || result.affectedRows === 0) {
    res.status(404).json({ error: "笔记不存在" });
    return;
  }
  res.status(204).end();
});
