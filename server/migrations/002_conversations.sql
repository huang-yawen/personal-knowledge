-- 会话：knowledge_base_id 是提问范围，NULL 表示全部知识库；知识库被删除时置空
CREATE TABLE conversations (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  title VARCHAR(100) NOT NULL,
  knowledge_base_id BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_conversations_user_updated (user_id, updated_at),
  CONSTRAINT fk_conversations_kb FOREIGN KEY (knowledge_base_id) REFERENCES knowledge_bases (id) ON DELETE SET NULL
) CHARACTER SET utf8mb4;

-- 消息：助手消息的 citations 保存回答时的引用快照（文档名、页码、片段、相似度），文档之后被删除也不影响历史阅读
CREATE TABLE messages (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  conversation_id BIGINT UNSIGNED NOT NULL,
  role ENUM('user', 'assistant') NOT NULL,
  content MEDIUMTEXT NOT NULL,
  citations JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_messages_conversation (conversation_id, id),
  CONSTRAINT fk_messages_conversation FOREIGN KEY (conversation_id) REFERENCES conversations (id) ON DELETE CASCADE
) CHARACTER SET utf8mb4;
