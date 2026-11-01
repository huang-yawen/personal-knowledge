-- 会话管理：收藏、归档，以及多知识库检索范围
ALTER TABLE conversations
  ADD COLUMN is_favorite TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN archived_at TIMESTAMP NULL;

-- 会话的检索范围：没有记录表示“全部知识库”；知识库或会话被删除时对应行级联删除
CREATE TABLE conversation_knowledge_bases (
  conversation_id BIGINT UNSIGNED NOT NULL,
  knowledge_base_id BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (conversation_id, knowledge_base_id),
  CONSTRAINT fk_ckb_conversation FOREIGN KEY (conversation_id) REFERENCES conversations (id) ON DELETE CASCADE,
  CONSTRAINT fk_ckb_knowledge_base FOREIGN KEY (knowledge_base_id) REFERENCES knowledge_bases (id) ON DELETE CASCADE
) CHARACTER SET utf8mb4;

-- 把原来单个知识库的范围迁移过来
INSERT INTO conversation_knowledge_bases (conversation_id, knowledge_base_id)
SELECT id, knowledge_base_id FROM conversations WHERE knowledge_base_id IS NOT NULL;
