-- 范围已迁移到 conversation_knowledge_bases，删除旧的单知识库列（外键需要先删）
ALTER TABLE conversations DROP FOREIGN KEY fk_conversations_kb;
ALTER TABLE conversations DROP COLUMN knowledge_base_id;
