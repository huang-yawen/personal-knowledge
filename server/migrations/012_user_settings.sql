-- 用户偏好：回复风格、每次引用的资料条数、新对话默认的知识库范围（NULL 或空数组表示全部）
CREATE TABLE user_settings (
  user_id BIGINT UNSIGNED PRIMARY KEY,
  reply_style VARCHAR(10) NOT NULL DEFAULT 'balanced',
  top_k TINYINT UNSIGNED NOT NULL DEFAULT 5,
  default_kb_ids JSON NULL,
  CONSTRAINT fk_settings_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) CHARACTER SET utf8mb4;
