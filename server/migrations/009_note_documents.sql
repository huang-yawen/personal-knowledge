-- 笔记加入知识库：把笔记生成为一份文档（走现有的切块、向量化流程）。
-- source_note_id 指向来源笔记；source_note_hash 是同步时“标题 + 正文”的指纹，用来判断笔记之后有没有改动。
-- 不设外键：删除笔记时由代码同时清理文档、文件和向量
ALTER TABLE documents
  ADD COLUMN source_note_id BIGINT UNSIGNED NULL,
  ADD COLUMN source_note_hash CHAR(64) NULL,
  ADD UNIQUE INDEX uniq_documents_source_note (source_note_id);
