-- 中止的回答：用户点「停止」或直接关闭页面时，把已经生成的部分存下来并标记为未完成，
-- 避免刷新后这部分内容凭空消失。前端据此显示「已停止生成」而不是当成完整回答。
ALTER TABLE messages ADD COLUMN incomplete TINYINT(1) NOT NULL DEFAULT 0;
