-- 长对话滚动摘要：超出最近窗口的早期消息压缩成一段摘要，随对话一起送进提示词，
-- 避免第 N 轮开始前文被硬切掉。summary_until_message_id 标记摘要覆盖到哪条消息，
-- 下次只需要压缩它之后的新消息。
ALTER TABLE conversations
  ADD COLUMN summary TEXT NULL,
  ADD COLUMN summary_until_message_id BIGINT UNSIGNED NULL;
