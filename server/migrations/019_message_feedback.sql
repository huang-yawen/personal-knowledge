-- 回答反馈：点赞 / 点踩及点踩原因。一条消息每个用户只保留一条记录，
-- 重复提交（例如先点踩、再补充原因）按唯一键更新。
CREATE TABLE message_feedback (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  message_id BIGINT UNSIGNED NOT NULL,
  rating ENUM('positive', 'negative') NOT NULL,
  reason VARCHAR(32) NULL,
  comment VARCHAR(500) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_feedback_message_user (message_id, user_id),
  INDEX idx_feedback_user_rating (user_id, rating, created_at),
  CONSTRAINT fk_feedback_message FOREIGN KEY (message_id) REFERENCES messages (id) ON DELETE CASCADE
) CHARACTER SET utf8mb4;
