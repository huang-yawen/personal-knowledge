-- 演示账号：标记后该账号只能浏览与提问，不能上传、修改或删除数据。
-- 用途是让 HR / 面试官点开链接能直接体验，而不必担心被陌生人改坏数据或烧掉额度。
ALTER TABLE users ADD COLUMN is_demo TINYINT(1) NOT NULL DEFAULT 0;
