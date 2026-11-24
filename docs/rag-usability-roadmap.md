# 可用性提升路线图：检索质量 × 答案可信 × 文档治理 × 评估闭环

> 适用版本：当前工作区。目标不是罗列最佳实践，而是把你列出的四个方向落到这个仓库的具体文件、表结构和验收指标上。
>
> 一句话结论：**召回池已经够用（rerank 只排序就把 recall@5 从 83.3% 拉到 100%），下一步的收益不在"再加一路召回"，而在"结构切片 + 引用可信 + 坏例闭环 + 生成侧评估"。**

---

## 0. 先看基线

| 方向 | 已经做到的 | 证据 | 关键缺口 |
| --- | --- | --- | --- |
| 混合检索 | 向量 + MySQL ngram 全文，RRF 融合，失败自动退回 | `server/src/modules/rag/keyword.ts`、`fuse.ts`；`RETRIEVAL_HYBRID` 默认关 | 只有全局开关，没有按查询类型路由；23 条语义题里只有 2 条命中关键词路 |
| 精排 | bge-reranker-v2-m3，支持影子模式、失败降级、分数落日志 | `server/src/modules/rag/rerank.ts`、`retrieve.ts` | 总是全量重排；召回池 4×（20~50）偏大；无缓存 |
| 切片 | 固定 800 字 + 100 重叠 + 句末回退 | `server/src/modules/worker/chunk.ts` | 无标题层级、无父子块、代码块/表格会被切断 |
| 查询改写 | 指代/序数检测 + 拼上一轮用户问题 | `server/src/modules/rag/query.ts` | 只看上一轮**用户**问题；没有级联改写/多路扩展 |
| 引用 | 回答下方来源标签 + 阅读抽屉定位高亮 + 依据说明 | `src/components/MessageSources.tsx`、`src/components/DocumentReader.tsx` | 正文里的 `[1]` 不可点击；无效编号被静默丢弃 |
| 拒答 | 严格模式提示词 + `【通用知识】` 标注 | `server/src/modules/chat/prompt.ts` | 严格模式藏在个人中心；默认模式 0/5 正确拒答是已知取舍 |
| 解析 | PDF / DOCX / TXT / MD / 图片 OCR，逐页容错 | `server/src/modules/worker/parse.ts` | DOCX 只取纯文本（标题/表格丢失）；PDF 表格无结构；无解析质量评估 |
| 治理 | 知识库范围过滤、笔记→知识库同步、`outdated` 标记 | `server/src/modules/note/knowledge.ts` | 文档无标签/日期/版本/归档/替代关系；无内容去重 |
| 评估 | 23 条测集，recall@k / MRR / 拒答 / 耗时，报告落盘 | `server/eval/run.ts`、`dataset.json` | 只评检索，不评生成；集太小且全是"关于本项目文档"的语义题 |
| 反馈 | assistant-ui 的点赞/点踩组件已接好（`thread.aui.tsx`） | `src/components/assistant-ui/elements/thread.aui.tsx:702` | 没传 `feedback` adapter，按钮不显示；无表、无接口、无归因 |

当前基线（README 实测，23 题 / 28 分块）：

| 配置 | recall@5 | MRR@5 | 正确拒答 | 单次耗时 |
| --- | --- | --- | --- | --- |
| 向量下限 0.35 | 83.3% | 0.625 | 0/5 | 245ms |
| 精排只排序、不设阈值 | **100%** | **0.768** | 0/5 | 650ms |
| 精排 + 阈值 0.1 | 61.1% | 0.583 | 4/5 | 709ms |

**三个判断：**

1. **别急着加召回。** recall@20 已经是 100%，top-5 只有 83.3%，说明该找的都在池子里，问题在排序与切片粒度。继续加一路检索的边际收益，低于把切片和引用做好。
2. **别再用单一阈值做拒答。** 你自己的数据已经证明：同一套代码换语料后，正负样本分数区间重叠（负样本最高 0.135、正样本最低 0.132），阈值不可复用。拒答要靠严格模式 + UI 明确标注 + 反馈闭环，而不是把 rerank 阈值设死。
3. **测集扩到 80 条之前，不要调 chunk / rerank / hybrid 参数。** 23 条题上 2~3 个百分点的波动大概率是噪声，越调越容易过拟合。

### 0.1 先修两个会丢数据的 bug（优先于所有 RAG 优化）

这两条与检索无关，但会让用户"不敢用"，而且修复成本很低：

1. **笔记自动保存的 pending 会跨笔记合并**：`src/pages/NotesPage.tsx:111-130` 的 `flush` 在失败时把 job 放回 `pending` 却不 reject；`:159-165` 的 `edit` 用 `{ ...pending.current, id: current.id }` 合并。结果是：A 笔记保存失败后切换到 B，再改 B 的标题，会把 **A 的正文 PATCH 到 B**。修复：`pending` 按 noteId 分桶；保存失败必须 reject 并阻止切换或明确提示；绝不跨 id 合并；补 `beforeunload` 本地草稿和标题/正文 `maxLength`。
2. **401 直接整页 reload**：`src/lib/api.ts:44` + `src/lib/auth-store.ts:36`。自动保存、上传、AI 请求任意一处 401 都会 `window.location.reload()`，未保存内容全丢且没有"登录已过期"提示。修复：全局 `sessionExpired` 状态 + 提示 + 保存草稿 + `returnTo` 跳登录，不要 reload。

---

## 1. 检索链路优化

### 1.1 混合检索：从"全局开关"改成"按查询路由"

**为什么现在没收益**：你的评估集全是语义型问法，和正文没有共享字面片段；关键词路只对"型号 / 人名 / 错误码 / 代码标识符"这类精确内容有价值。问题不是混合检索没用，而是**没有一类题去测它**。

**怎么做：**

1. 新增 `server/src/modules/rag/route.ts`，判断查询是否"字面型"：

   ```ts
   // 命中任一即认为需要关键词路
   const LITERAL_PATTERNS = [
     /[A-Za-z][A-Za-z0-9_.:/-]{2,}/,        // API 名、标识符、错误码
     /[A-Z]{2,}-\d+/,                        // ERR-404
     /v?\d+(?:\.\d+){1,3}/,                  // 版本号
     /[“"「『《][^”"」』》]{2,}[”"」』》]/,    // 引号/书名号内的精确片段
   ];
   ```

2. `retrieveChunks` 增加 `route?: "auto" | "dense" | "hybrid"`：`auto` 时字面型查询即使 `RETRIEVAL_HYBRID=false` 也跑关键词路，其余走全局配置。
3. 关键词查询构造别再把引号当运算符删掉：
   - 引号内片段 → `+"原短语"`（必须命中）；
   - 标识符 → `+term`；
   - 自然语言部分保持宽松，避免整句 AND 导致零命中。
4. 日志补 `routeReason`、`keywordHits`，评估报告按题型分片统计。

**验收**：新增 10 条字面型题（型号、错误码、人名、代码标识符），关键词路由开启后该分片 recall@5 ≥ 90%，语义分片不掉点。

> 注意：MySQL ngram 默认 `ngram_token_size=2`，单字/单字母标识符匹配不到。文档里写清楚这个限制，别让用户以为"搜不到就是没有"。

### 1.2 精排：保留排序价值，压低延迟

**现状**：默认只排序、不设阈值，这是对的；代价是首字延迟 +400ms 左右。

**怎么做：**

- **缩小候选池**：`topK=5` 时从 `max(4×, 20) ≤ 50` 收到 `max(3×, 15) ≤ 30`，先在评估集上确认 recall 不掉。
- **加 LRU 缓存**：key = `sha1(query + 排序后的 chunkId 列表 + model + minScore)`，TTL 10 分钟。同一对话里重复问、或"重新生成"会直接命中。
- **超时降到 2.5s**，失败已有 `null → 退回向量排序` 的路径，不用改。
- **把精排耗时暴露到前端**（见 2.1 的阶段事件），让用户知道这 0.6s 花在哪。
- 如果还要更快，用评估集 A/B `bge-reranker-base`，不要凭感觉换模型。

**验收**：P95 检索+精排 < 1.5s；recall@5 不低于基线；精排降级率 < 1%。

### 1.3 切片：结构感知 + 父子块（收益最大的一项）

**现状**：`chunk.ts` 是固定窗口，800 字 / 100 重叠。它会把一个 Markdown 表格从中间切开，把代码块拦腰截断；而且每个块没有标题路径，模型看到一个片段不知道它属于哪一节。

**怎么做：**

1. 把 `chunkText(text)` 换成 `chunkPages(pages)`（保留 PDF 页码），规则：
   - 先按 Markdown 标题（`^#{1,6} `）切 section，记录 `heading_path`（如 `检索调优 > 精排`）；
   - section 内按段落/句子切 300~500 字的**子块**，重叠 10~15%；
   - fenced code（```）和表格行（含 `|`）不拆，超过 2000 字再退化为普通切分；
   - PDF 以页为边界，页内按段落。
2. 迁移 019：

   ```sql
   ALTER TABLE document_chunks
     ADD COLUMN heading_path VARCHAR(500) NULL,
     ADD COLUMN chunk_kind ENUM('text','table','code') NOT NULL DEFAULT 'text',
     ADD COLUMN parent_id BIGINT UNSIGNED NULL,
     ADD COLUMN token_count INT UNSIGNED NULL,
     ADD INDEX idx_chunks_parent (parent_id);

   CREATE TABLE document_sections (
     id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
     document_id BIGINT UNSIGNED NOT NULL,
     heading_path VARCHAR(500) NOT NULL DEFAULT '',
     content MEDIUMTEXT NOT NULL,
     page_start INT UNSIGNED NULL,
     page_end INT UNSIGNED NULL,
     INDEX idx_sections_document (document_id),
     CONSTRAINT fk_sections_document FOREIGN KEY (document_id) REFERENCES documents (id) ON DELETE CASCADE
   ) CHARACTER SET utf8mb4;
   ```

3. **检索用子块，喂给模型用父块**：向量召回 + 精排仍以 300~500 字子块为单位（精度），命中后按 `parent_id` 取父 section 内容（上限 1200~1500 字，保证上下文完整）。引用仍指向子块 id 和页码，阅读抽屉高亮不变。
4. **去重与多样性**：精排后丢弃与已选块 token Jaccard > 0.8 的重复块；`topK=5` 时加 MMR（λ=0.7），避免相邻重叠块占满名额。
5. **版本化**：给 `documents` 加 `chunker_version`，`messages.retrieval_meta` 里记下版本；换切片策略后必须 `npm run reindex`，否则新旧块混排。

**验收**：评估集 recall@5 不降；进入提示词的 token 数下降 15~30%；表格题/代码题命中率提升；同一文档相邻块不再重复占位。

### 1.4 查询改写：级联触发，不要全量

**现状**：`buildRetrievalQuery` 只在检测到代词/序数时，把上一轮**用户**问题拼进检索串。这对"它有什么优点"有效，但对"第二点展开说说"不够——"第二点"指的是**上一条回答**里的分点。

**怎么做：**

1. **序数追问带上上一条回答**：`needsContext` 命中序数（`第[一二三...]点/条`）或"展开"时，检索串 = 截断 400 字的上一轮助手回答 + 当前问题。只影响检索，发给模型的仍是原话。补对应单测。
2. **级联改写**：先按现有规则检索一次；只有满足以下任一条件才调一次轻量改写（DeepSeek，2s 超时，150 tokens）：
   - `hits < 2`；或
   - top1 分数 < 0.45；或
   - top1 与 top5 分差 < 0.05（排序没有区分度）。
   改写输出：一个独立问题 + 最多 2 个子问题，分别检索后用 RRF 与第一轮融合。额外延迟上限 1.5s。
3. **多部分问题**：题目里出现"和/与/分别/对比/区别"且有两个问号时，按连接词拆成 2 路检索再融合。先用启发式，别上 LLM。
4. 日志补 `rewriteUsed`、`rewriteMs`、`subQueries`。

**验收**：追问分片 recall@5 提升；改写触发率 < 20%；P95 延迟增加 < 500ms。

### 1.5 让检索结果可解释

每条回答保存一份 `retrieval_meta`：实际检索串、改写串、每个候选的 dense score / rerank score / matchedBy、各阶段耗时、当时的配置快照（`minScore`、hybrid、rerank、chunker_version、prompt_version）。

这是后面"引用校验、反馈归因、评估回放"的共同底座，**建议和 2.1 一起做**。

---

## 2. 生成与交互体验

### 2.1 流式阶段状态（最便宜的信任提升）

**现状**：SSE 只有 `conversation → sources → delta → followups → done/error`。检索 + 精排的 0.3~1s 里前端什么都不显示；如果 embedding 服务在重试，用户会以为卡死。

**协议扩展：**

```ts
// src/lib/api.ts
type ChatEvent =
  | { type: "conversation"; id: number }
  | { type: "stage"; stage: "retrieving" | "reranking" | "generating"; hits?: number; ms?: number }
  | { type: "sources"; sources: ChatSource[] }
  | { type: "delta"; text: string }
  | { type: "followups"; items: string[] }
  | { type: "saved"; messageId: number }   // 见 2.4
  | { type: "done" }
  | { type: "error"; message: string };
```

**服务端**（`server/src/modules/chat/routes.ts`）：

- `conversation` 事件之后立刻发 `stage: retrieving`；
- 给 `retrieveChunks` 加 `onStage?: (stage) => void`，精排前发 `reranking`；
- 检索完发 `stage: generating` 带 `hits`；
- `finally` 里清心跳：每 15s 写一行 `: ping\n\n`，防止代理断连；前端解析器已经只认 `data:`，会自然忽略。

**前端**：

- `streamChat` 解析新事件；`MyRuntimeProvider` 写入 zustand `chatStage`（按 `threadKey` 校验，切对话不串台）；
- `ChatPage` 在 Thread 上方渲染一行状态："正在检索资料…" → "找到 5 个片段，正在精排…" → "正在生成回答…"；
- `done / error / abort` 清空。不要把状态塞进消息正文，否则会污染历史和导出。

**验收**：首个状态 < 200ms 出现；阶段文案与实际阶段一致；消息落库内容不变。

### 2.2 行内引用与引用校验

**现状**：来源标签在回答下方，正文里的 `[1]` 是纯文本；如果模型编了 `[7]`，服务端 `filter` 会静默丢弃，用户完全不知道。

**怎么做：**

1. 写一个 remark 插件（只遍历 text 节点，跳过 `inlineCode` / `code` / `link`），把 `[1]`、`[1][2]`、`[1, 2]` 转成 `#cite-1` 链接；
2. 覆写 Markdown 的 `a` 组件：`href` 以 `#cite-` 开头时渲染成 `<sup><button>`，点击用 `metadata.custom.sources` 里的 `documentId`/`chunkId` 打开阅读抽屉；
3. 找不到对应编号时渲染红色 `?`，并在 `MessageSources` 里加一行"有 1 处引用未匹配资料"；
4. 服务端在 `citedIndexes` 后校验 `index <= retrieved.length`，把无效编号数写进 `retrieval_meta` 和日志。

**验收**：点击正文 `[1]` 能打开正确片段；无效引用率可观测（目标 < 1%）。

> 你的 `markdown-text.tsx` 已经给 `sup` 写了 `[&>a]` 样式，说明这个交互原本就在设计里，只是没实现。

### 2.3 拒答边界与"依据"标注前移

**现状**：严格模式在个人中心里，默认关闭；默认模式按设计允许用通用知识回答（0/5 正确拒答）。这本身是合理取舍，但用户需要一个**一眼可见**的区分。

**怎么做：**

- 对话工具栏（知识库范围旁边）加"仅资料"开关，读写 `settings.strictMode`，当前状态直接显示在按钮上；
- `chunks.length === 0` 时，在回答上方显示"知识库中未检索到相关资料"，并给"上传资料"入口；
- 保留 `MessageSources` 现有的依据说明，但把"通用知识"的提示做得更显眼（图标 + 颜色）；
- **不要**为了让拒答率好看去设死 rerank 阈值——你的数据已经证明那会牺牲一半召回。

**验收**：用户 1 秒内能判断"这是资料里的还是模型自己说的"；严格模式使用率可统计。

### 2.4 反馈闭环（assistant-ui 已经帮你写好了按钮）

**现状**：`thread.aui.tsx:702` 有 `FeedbackPositive/Negative`，但 `useLocalRuntime` 没传 `adapters.feedback`，所以 `capabilities.feedback` 为 false，按钮不渲染。

**怎么做：**

1. `saveAssistantMessage` 返回 `insertId`；SSE 在 `done` 前发 `{ type: "saved", messageId }`；
2. `MyRuntimeProvider` 里把 `messageId` 写进消息 `metadata.custom`，并传：

   ```ts
   useLocalRuntime(chatAdapter, {
     initialMessages,
     adapters: {
       feedback: {
         submit: ({ message, type, comment }) => {
           void submitFeedback(message.metadata.custom?.messageId, type, comment);
         },
       },
     },
   });
   ```

3. 迁移：

   ```sql
   CREATE TABLE message_feedback (
     id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
     user_id BIGINT UNSIGNED NOT NULL,
     message_id BIGINT UNSIGNED NOT NULL,
     rating ENUM('positive','negative') NOT NULL,
     reason VARCHAR(32) NULL,
     comment VARCHAR(500) NULL,
     retrieval_meta JSON NULL,
     created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
     UNIQUE KEY uk_feedback_message_user (message_id, user_id),
     CONSTRAINT fk_feedback_message FOREIGN KEY (message_id) REFERENCES messages (id) ON DELETE CASCADE
   ) CHARACTER SET utf8mb4;
   ```

4. 点踩时弹出原因（答非所问 / 资料过时 / 找不到信息 / 引用错误 / 内容不完整），可填一句备注；把该消息的 `retrieval_meta` 一起存下来；
5. 管理页加"坏例"列表，支持导出 JSONL，直接喂给评估集。

**验收**：点踩能落库并带上检索快照；每周能把坏例转成测试题。

### 2.5 答案诊断元数据

- `messages` 加 `retrieval_meta JSON`（或单独表），内容见 1.5；
- 前端在回答操作栏加"复制诊断信息"（检索串、命中块、分数、配置版本、耗时），用户报障时直接粘贴；
- 日志里已有 `scores/hits/rerankScores/retrievalMs/firstTokenMs`，把 `configVersion` 补上即可串起来。

### 2.6 顺手可修的交互问题（成本低，影响直接）

这几条不属于 RAG 算法，但会持续制造"这产品不太行"的第一印象，建议和 P0 一起做：

- **知识库搜索是假的**：`src/pages/KnowledgePage.tsx:217` 的"搜索知识库"是 `div + span`，旁边的筛选按钮也没有 `onClick`。要么接上真实过滤（本地 filter 就够），要么先移除，别让用户点了没反应。
- **刷新 `/chat` 会丢当前对话**：`chat-store` 只存内存，地址里也没有 conversation id。把地址改成 `/chat/:id`（或至少把 id 写进 `sessionStorage` 并在启动时恢复），刷新、分享链接、浏览器后退才符合预期。
- **重命名/删除用原生 `window.prompt/confirm`**：`KnowledgePage.tsx:176`、`:197`，`ConversationList.tsx:66`、`:134`，`NotesPage.tsx:288`。样式不一致、移动端体验差，也无法做"删除后可撤销"。项目里已经有 `src/components/ui/dialog.tsx`（目前零引用），直接用它统一。
- **欢迎页的四个"推荐问题"是 `<span>`**：`src/pages/ChatPage.tsx:93-96`，看起来可点但点了没反应。改成按钮，点击填入输入框（和 `DocumentReader` 的推荐问题一致）。
- **缺少全局反馈**：各页错误都是就地一行 `form-error`，跨页操作（如从工作台重试失败）容易被忽略。加一个极简 toast store（`{message, tone}` + 3s 自动消失 + `role="status"`）即可，不必引入组件库。
- **手机端知识库页滚不动**：≤760px 时 `.knowledge-layout` 改成 `display:block` 但仍保留 `overflow:hidden`，父容器又是固定高度；文档一多，底部的文档行、处理提示和上传入口都到不了。让 `.knowledge-page` 或 `.knowledge-layout` 真正成为滚动容器（`overflow-y:auto`，去掉固定 `min-height`）。
- **窄屏 AI 面板关不掉**：≤1100px 时笔记页的 AI 面板变成绝对定位覆盖层（`theme.css:147`、`:159-166`），没有关闭按钮、遮罩和 Esc，唯一的开关在它背后。加面板内关闭按钮 + 遮罩 + Esc，或窄屏改成可折叠的底部抽屉。

可访问性上还有 5 个"改几行就见效"的点，建议一并处理（详见 `docs/` 之外的可访问性审计）：

1. `index.html` 的 `lang="en"` 改成 `zh-CN`，登录页补 `document.title`；
2. 折叠侧栏时导航文字被 `display:none`，给链接补 `aria-label`；
3. "上传资料"是 `<label>` 包隐藏 `<input>`，键盘不可达，改成按钮触发 `input.click()`；
4. 文档行用 `div onClick` 打开阅读抽屉，改成 `<button>`；
5. 个人中心的 `Toggle` 只有空 `<span>`，补 `aria-label`；再加一条全局 `:focus-visible` 样式，删掉输入框上的 `outline:none`。

---

## 3. 文档解析与知识治理

### 3.1 解析质量分级

**现状**：解析失败只有一句 error_message；扫描件、表格、双栏 PDF 解析出乱码也照样入库，用户不知道"这份资料其实没读好"。

**怎么做：**

- 解析后计算质量指标：`charsPerPage`、非文字字符占比、表格行数、标题数、是否触发 OCR；
- `documents` 加 `parse_quality JSON`、`needs_review TINYINT(1)`；
- 文档列表对低质量文档显示"解析质量较低，建议重新解析"，并提供"用 OCR 重新解析"按钮（复用 retry，增加 `mode=ocr`）；
- 验收：扫描件/表格件能被标记；失败原因可执行（不是"处理失败"四个字）。

### 3.2 DOCX / PDF 的结构化解析

**DOCX**：现在 `mammoth.extractRawText` 只取纯文本，标题、表格、列表全丢。改成 `mammoth.convertToHtml` → `turndown` + `turndown-plugin-gfm` 转 Markdown，再走结构化切片。

**PDF**：
- 纯文本 PDF 保持每页文本 + 页码；
- 若某页字符数低于阈值、或数字/符号占比异常高（疑似表格），把该页图片交给现有 Qwen-VL，提示词改为"转成 Markdown，保留标题层级和表格（用 Markdown 表格）"；
- 只对可疑页调用 VLM，不要整份 PDF 都走视觉模型（成本）。
- 长期：表格特别多的资料可以接 Docling/MinerU 旁路，但**先用量化指标证明普通 PDF 不够用**，别提前上重工具。

**验收**：新增"表格题"分片；一份带表格的 DOCX/PDF 能解析出 Markdown 表格，问答能引用到表格内容。

### 3.3 元数据与过滤

**现状**：检索范围只到知识库；没有标签、日期、版本，用户没法问"只查 2026 年的财报"。

**怎么做：**

- `documents` 加：

  ```sql
  ALTER TABLE documents
    ADD COLUMN tags JSON NULL,
    ADD COLUMN doc_type VARCHAR(32) NULL,
    ADD COLUMN author VARCHAR(100) NULL,
    ADD COLUMN effective_at DATE NULL,
    ADD COLUMN content_hash CHAR(64) NULL,
    ADD COLUMN archived_at DATETIME NULL,
    ADD COLUMN superseded_by BIGINT UNSIGNED NULL,
    ADD UNIQUE KEY uk_documents_kb_hash (knowledge_base_id, content_hash);
  ```

- 上传时算 SHA-256：同一知识库重复上传直接提示"已存在，是否更新版本"，不再重复切块/嵌入；
- 检索接口加 `filters: { tags?, from?, to?, includeArchived? }`；Qdrant payload 加 `tags`（keyword 索引）与 `effective_at`（integer 时间戳），SQL 关键词路同步加条件；
- 对话页的范围选择器加"高级筛选"，文档行显示标签；
- 验收：带标签/日期的查询只返回符合范围的资料；重复上传不增加分块数。

### 3.4 生命周期与新旧冲突

**现状**：笔记有 `outdated`，文档没有"过时/归档/被替代"的概念；新旧资料冲突时，检索可能把旧的排前面。

**怎么做：**

- `archived_at`：默认从检索中排除；界面上"已归档"筛选可查；
- `superseded_by`：被替代的文档在精排后降权（如 ×0.5），并在引用卡片上标"已被《新文档》替代"；
- `effective_at`：只在精排分数接近时做时间加权，不要让它压过相关性；
- 笔记同步到知识库时记录 `source_document_id`；来源文档归档后，笔记页显示"来源已归档"横幅；
- 检索策略写进 `retrieval_meta`，出问题能复盘。

**验收**：构造"旧文档说 A、新文档说 B"的测试题，新文档在 top-3 的比例 ≥ 90%。

### 3.5 权限边界

当前按 `user_id` 隔离是完整的（SQL 与 Qdrant 都过滤了）。**在真正需要分享之前，不要引入部门/角色 ACL**；一旦引入，必须同时在 SQL 和 Qdrant payload 两层过滤，并补跨用户检索的回归测试。

---

## 4. 评估与可观测性

### 4.1 测集 v3：从 23 条到 80~120 条

按题型分层，每类至少 8~10 条：

| 类型 | 例子 | 考察点 |
| --- | --- | --- |
| 字面型 | "ERR-4021 是什么错误"、"BGE-M3 的维度" | 关键词路 |
| 表格型 | "2026 Q2 的营收是多少" | 解析 + 切片 |
| 多跳型 | "A 文档里的方案和 B 文档的有什么区别" | 多路召回/融合 |
| 时序/冲突 | "最新的部署方式是什么"（新旧两版） | 生命周期 |
| 追问型 | "第二点展开说说" | 改写 |
| 不可答 | "红烧肉怎么做" | 拒答 |

每条记录：`goldenAnswer`、`relevant: [{ docId, contains, heading? }]`、`difficulty`、`source`（人工/反馈）。**留 40% 作为 test，调参只看 dev。**

### 4.2 指标

**检索层**：recall@5、recall@20、MRR@5、nDCG@5、context precision、zero-hit rate、各阶段 P50/P95。

**生成层**（新增）：
- **答案正确性**：LLM judge 对照 goldenAnswer 打 0/1/2 分；
- **忠实度**：把回答拆成 claims，逐条判断能否被提供资料支持（Ragas 的 faithfulness，或自己写 30 行 rubric）；
- **引用精确率**：`[n]` 所在句子是否真的由第 n 个片段支持；
- **拒答准确率**：不可答题是否明确说"没找到"，可答题是否没有误拒。

**产品层**：点踩率及原因分布、引用点击率、首状态延迟、放弃率。

### 4.3 E2E 评估

- `npm run eval -- --mode=retrieval`（现有）与 `--mode=e2e`（新增，真实生成 + judge）；
- judge 用 DeepSeek，输出固定 JSON，按 `(question, answer, chunks, promptVersion)` 哈希缓存，避免重复计费；
- 100 题一轮约 30 万 token，**夜间/每周跑**，不要放进每次提交的 CI；
- 抽 20% 人工复核 judge 的一致性。

### 4.4 回归与 CI

- `server/eval/baseline.json` 记录当前指标与配置版本；
- 回归门槛：recall@5 下降 > 2pt 或 faithfulness 下降 > 3pt 视为失败；
- 单测覆盖：`chunkPages`、`detectLiteralQuery`、`buildRetrievalQuery`（序数带助手回答）、`applyRerankResults` 越界/重复；
- 集成冒烟（可选）：CI 起 MySQL + Qdrant，跑"上传 → 解析 → 检索"一条链。

### 4.5 线上可观测

- 每条回答的 `retrieval_meta`；日志加 `configVersion`、`chunkerVersion`、`promptVersion`；
- `/api/admin/metrics`：队列深度、失败文档数、精排降级率、zero-hit 率、点踩率；
- 每周把点踩 + 低分回答转成测集题目，形成闭环。

---

## 5. 路线图

> 进度：2026-11-24，P0 的「SSE 阶段事件 + 前端状态」「反馈落库 + 消息 id」「行内引用 + 无效引用提示」已完成；阶段事件补了 15 秒心跳和 SSE 解析器单测。

| 阶段 | 任务 | 主要文件 | 工作量 | 验收 |
| --- | --- | --- | --- | --- |
| **P0**（3~5 天） | SSE 阶段事件 + 前端状态 | `chat/routes.ts`、`api.ts`、`MyRuntimeProvider.tsx`、`ChatPage.tsx` | S | 首个状态 < 200ms |
| | 行内引用 + 无效引用提示 | `markdown-text.tsx`、新 remark 插件、`MessageSources.tsx` | M | 点击角标定位正确 |
| | 反馈落库 + 消息 id | `repository.ts`、`thread.aui.tsx`、新 migration/route | M | 点踩带检索快照 |
| | `retrieval_meta` | `chat/routes.ts`、`messages` 迁移 | S | 可回放一次坏例 |
| | 测集 v3 骨架 + baseline | `eval/dataset.json`、`eval/run.ts` | M | 80 条、分片统计 |
| **P1**（1~2 周） | 结构切片 + 父子块 + 去重 | `worker/chunk.ts`、`rag/retrieve.ts`、迁移 019 | L | 同 recall、token -20% |
| | 字面查询路由 + 引号短语 | `rag/route.ts`、`keyword.ts`、`retrieve.ts` | M | 字面分片 recall ≥ 90% |
| | 级联改写 + 序数带助手回答 | `rag/query.ts`、`chat/routes.ts` | M | 追问分片提升，触发率 < 20% |
| | 精排缓存/缩池/超时 | `rag/rerank.ts`、`retrieve.ts` | S | P95 < 1.5s |
| **P2**（1~2 周） | DOCX→Markdown、PDF 表格页 VLM | `worker/parse.ts`、`worker/ocr.ts` | L | 表格题可答 |
| | 解析质量分级 | `parse.ts`、文档路由/UI | M | 低质量文档被标记 |
| | 元数据/标签/去重/归档 | `documents` 迁移、检索过滤、UI | L | 范围过滤生效 |
| | E2E judge + 夜间回归 | `eval/run.ts`、`eval/judge.ts` | M | 每周出报告 |
| **P3**（持续） | 指标看板、坏例周会、可选版面解析 | admin/metrics、docs | S | 点踩率下降 |

---

## 6. 不建议做的事

- ❌ **在 23 条题上继续调 minScore / rerank 阈值 / hybrid 开关。** 先扩测集，否则是在拟合噪声。
- ❌ **全量 LLM 改写每个 query。** 延迟和成本都会翻倍；用 1.4 的级联触发。
- ❌ **用单一 rerank 阈值做拒答。** 你自己的数据已经证明跨语料不可复用；用严格模式 + UI 标注。
- ❌ **所有 PDF 都走视觉模型。** 只对低文本密度/表格页触发，否则成本失控。
- ❌ **先上图数据库 / Agent / 微调。** 当前瓶颈在切片和评估，不在模型能力。
- ❌ **为了"看起来快"关掉精排。** 它救回了 16.7pt 的 recall@5，是当前性价比最高的组件。

---

## 7. 底座：如果"可用性"也包括服务可用性

以下三项来自后端可靠性审计，成本低、优先级高，建议在对外放量前完成：

1. **队列可恢复化**：`documents` 加 `attempts` / 心跳，处理前记录；连续失败 N 次标 `failed`，启动时 sweeper 周期扫描卡住的 `parsing/embedding`。否则一份 20MB 扫描 PDF 就可能让服务进入"重启 → 重新入队 → 再 OOM"的循环，并堵住所有用户的上传。
2. **优雅退出**：保存 `app.listen` 返回值，`SIGTERM` 时停止接新连接、排空队列、`pool.end()`；systemd 加 `TimeoutStopSec=30`，`ExecStart` 直接用 node 而非 npm（npm 会吞掉 SIGTERM）。否则每次部署都会丢掉正在流式输出的回答。
3. **`/api/ready` + 部署校验**：现有 `/api/health` 只探 MySQL；补 Qdrant `/readyz`、队列积压阈值，部署脚本用 `curl -f` 校验，失败自动回滚 `dist.prev`。

---

## 8. 第一周清单

1. 跑一遍现有 `npm run eval`，把结果存成 `baseline.json`，记录当前配置。
2. 扩 20 条题：字面 5、表格 3、多跳 3、冲突 2、追问 3、不可答 4。
3. 发 `stage` 事件 + 前端状态（半天）。
4. 反馈落库 + 消息 id（一天）。
5. 行内引用（一到两天）。
6. 用一周真实点踩补充测集，再决定 P1 先做切片还是先做路由。
