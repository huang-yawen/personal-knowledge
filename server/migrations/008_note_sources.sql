-- 笔记来源：记录笔记引用的文档（可带分块）或对话。
-- ref_id 不设外键：来源被删除后笔记仍保留 label（名称快照），只是链接失效
CREATE TABLE note_sources (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  note_id BIGINT UNSIGNED NOT NULL,
  type VARCHAR(20) NOT NULL,
  ref_id BIGINT UNSIGNED NOT NULL,
  chunk_id BIGINT UNSIGNED NULL,
  label VARCHAR(255) NOT NULL,
  INDEX idx_note_sources_note (note_id),
  CONSTRAINT fk_note_sources_note FOREIGN KEY (note_id) REFERENCES notes (id) ON DELETE CASCADE
) CHARACTER SET utf8mb4;
