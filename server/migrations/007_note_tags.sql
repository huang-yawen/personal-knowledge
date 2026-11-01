-- 笔记标签：纯文本标签，笔记删除时级联删除
CREATE TABLE note_tags (
  note_id BIGINT UNSIGNED NOT NULL,
  tag VARCHAR(20) NOT NULL,
  PRIMARY KEY (note_id, tag),
  INDEX idx_note_tags_tag (tag),
  CONSTRAINT fk_note_tags_note FOREIGN KEY (note_id) REFERENCES notes (id) ON DELETE CASCADE
) CHARACTER SET utf8mb4;
