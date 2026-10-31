-- 知识库
CREATE TABLE knowledge_bases (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(100) NOT NULL,
  description VARCHAR(500) NOT NULL DEFAULT '',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_knowledge_bases_user (user_id)
) CHARACTER SET utf8mb4;

-- 文档：status 对应 等待处理 / 解析中 / 向量化中 / 成功 / 失败
CREATE TABLE documents (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  knowledge_base_id BIGINT UNSIGNED NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  stored_path VARCHAR(500) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  size_bytes BIGINT UNSIGNED NOT NULL,
  status ENUM('pending', 'parsing', 'embedding', 'done', 'failed') NOT NULL DEFAULT 'pending',
  error_message VARCHAR(1000) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_documents_user_kb (user_id, knowledge_base_id),
  CONSTRAINT fk_documents_kb FOREIGN KEY (knowledge_base_id) REFERENCES knowledge_bases (id) ON DELETE CASCADE
) CHARACTER SET utf8mb4;

-- 文档分块：保存原文位置，向量本身存在 Qdrant，这里只记录对应的 point id
CREATE TABLE document_chunks (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  knowledge_base_id BIGINT UNSIGNED NOT NULL,
  document_id BIGINT UNSIGNED NOT NULL,
  chunk_index INT UNSIGNED NOT NULL,
  content MEDIUMTEXT NOT NULL,
  page_number INT UNSIGNED NULL,
  vector_point_id CHAR(36) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_chunks_doc_index (document_id, chunk_index),
  INDEX idx_chunks_user_kb (user_id, knowledge_base_id),
  CONSTRAINT fk_chunks_document FOREIGN KEY (document_id) REFERENCES documents (id) ON DELETE CASCADE
) CHARACTER SET utf8mb4;
