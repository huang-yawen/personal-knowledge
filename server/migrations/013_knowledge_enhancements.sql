-- 知识库回答指令、严格模式（只依据资料回答）、文档摘要与推荐问题
ALTER TABLE knowledge_bases ADD COLUMN instructions VARCHAR(500) NOT NULL DEFAULT '';
ALTER TABLE user_settings ADD COLUMN strict_mode TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE documents
  ADD COLUMN summary TEXT NULL,
  ADD COLUMN suggested_questions JSON NULL;
