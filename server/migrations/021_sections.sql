-- 结构感知切片与父子块：
-- document_sections 保存按标题（或 PDF 页）切出的父段；document_chunks 仍是检索单位，
-- 命中子块后按 section_id 取父段，给模型补完整上下文。section_id 可为空，兼容旧分块。
CREATE TABLE document_sections (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  document_id BIGINT UNSIGNED NOT NULL,
  section_index INT UNSIGNED NOT NULL,
  heading_path VARCHAR(500) NOT NULL DEFAULT '',
  content MEDIUMTEXT NOT NULL,
  page_start INT UNSIGNED NULL,
  page_end INT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_sections_document_index (document_id, section_index),
  CONSTRAINT fk_sections_document FOREIGN KEY (document_id) REFERENCES documents (id) ON DELETE CASCADE
) CHARACTER SET utf8mb4;

-- 记录每份文档用的切片版本：换切块规则后能区分新旧文档
ALTER TABLE documents ADD COLUMN chunker_version VARCHAR(16) NOT NULL DEFAULT 'v1';

ALTER TABLE document_chunks
  ADD COLUMN section_id BIGINT UNSIGNED NULL,
  ADD COLUMN heading_path VARCHAR(500) NULL,
  ADD COLUMN chunk_kind ENUM('text', 'table', 'code') NOT NULL DEFAULT 'text',
  ADD INDEX idx_chunks_section (section_id),
  ADD CONSTRAINT fk_chunks_section FOREIGN KEY (section_id) REFERENCES document_sections (id) ON DELETE SET NULL;
