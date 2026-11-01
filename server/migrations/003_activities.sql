-- 动态（轨迹）：只追加的事件记录，title 保存事件发生时的名称快照，原资源之后被删除也不影响轨迹
-- type 目前有 kb_created / doc_uploaded / doc_ready / doc_failed / conversation_started，笔记相关类型留到 P3
CREATE TABLE activities (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  type VARCHAR(30) NOT NULL,
  title VARCHAR(255) NOT NULL,
  ref_id BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_activities_user_id (user_id, id)
) CHARACTER SET utf8mb4;
