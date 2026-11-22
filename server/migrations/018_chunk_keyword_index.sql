-- 关键词检索路：用 MySQL 的 ngram 全文索引做词面匹配，补向量检索对专有名词、
-- 型号、人名、错误码不敏感的短板。ngram_token_size 默认 2，中文按二元组切分，
-- 不需要额外词典；已有分块正文直接建索引，不用重新生成向量。
ALTER TABLE document_chunks ADD FULLTEXT INDEX ft_chunks_content (content) WITH PARSER ngram;
