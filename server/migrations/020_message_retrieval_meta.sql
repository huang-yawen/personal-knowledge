-- 每条助手消息的检索诊断：实际检索串、命中分块、分数、各阶段耗时和当时的配置快照。
-- 用于点踩后回放坏例，不需要再靠日志拼凑。
ALTER TABLE messages ADD COLUMN retrieval_meta JSON NULL;
