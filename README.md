# Personal Knowledge

个人知识库平台：导入资料 → 建立可检索知识库 → 基于资料问答 → 沉淀笔记。

## 当前状态

- 前后端已全部接入真实数据：工作台、AI 对话、我的知识库、我的笔记、个人中心（账号、AI 设置、使用统计、数据导出与账号删除）。
- 多用户：用户名 + 密码登录，注册需要一次性邀请码；每个用户的数据相互隔离。
- 每用户有限流与每日 token 额度、文档数与存储量配额（默认值见 `server/.env.example`）。

## 技术栈

- 前端：React 19 + TypeScript + Vite + Tailwind CSS 4 + shadcn/ui（Base UI）+ assistant-ui + zustand + react-router
- 后端（`server/`）：Express 5 + MySQL + Qdrant；Embedding 走 OpenAI 兼容接口，对话模型为 DeepSeek

## 开发

```bash
pnpm install
pnpm dev      # 启动开发服务器
pnpm build    # 类型检查并构建
pnpm lint     # oxlint 检查
pnpm test     # 前端单元测试（vitest，只跑纯逻辑，不需要浏览器）
```

提交到 `main` 或发起 PR 后，GitHub Actions（`.github/workflows/ci.yml`）会自动执行前端 lint/test/build 与后端 typecheck/test。

## 后端

需要本地可用的 MySQL 与 Qdrant。

```bash
cd server
cp .env.example .env   # 填写数据库、模型服务密钥、Qdrant 地址
npm install
npm run migrate        # 执行 server/migrations 下的迁移（含建库）
npm run dev            # 启动后端（tsx watch）
npm run typecheck      # 后端类型检查
npm test               # 单元测试（Node 自带 test runner）
```

账号相关脚本（在 `server/` 下运行）：

```bash
npm run invite                              # 生成一个一次性邀请码；第一个注册的账号自动成为管理员
npm run reset-password -- <用户名> <新密码>   # 重置密码（8 到 128 位），并使该账号已有登录失效
npm run reindex                             # 按数据库中的分块重建 Qdrant 向量（迁移、恢复备份后使用，会消耗 Embedding 额度）
```

`.env` 含密钥，不要提交到版本库。前端开发服务器通过 `/api` 访问后端（`vite.config.ts` 中 `changeOrigin` 必须为 false，否则后端的同源校验会拒绝登录）。

### 检索调优

问答的检索结果有两个可调点：

- **多轮追问**：`"它有什么优点"`、`"第二点展开说说"` 这类脱离上文没有主语的问题，会先把上一轮的用户提问拼进检索查询（`server/src/modules/rag/query.ts`）。只影响检索，发给模型的仍是用户原话。
- **相似度下限** `RETRIEVAL_MIN_SCORE`：低于该分数的资料不会进入提示词，`0` 表示不过滤。

标定方法：问答日志（`journalctl -u personal-knowledge -o cat | grep '"event":"chat"'`）每条都有 `scores`（本次实际分数）、`hits`（进入提示词的条数）、`candidates`（检索命中数）、`filtered`（被下限丢弃的条数）。拿几个你已知「库里确实没有」和「库里确实有」的问题各问一次，把下限定在两组分数之间。也可以直接调检索接口对比：

```bash
curl -s localhost:3001/api/rag/search -H 'Content-Type: application/json' \
  -d '{"query":"你的问题","minScore":0}'   # minScore 传 0 可关掉过滤，看完整分数
```

#### 精排（rerank）

向量召回只保证「语义相近」，不保证「能回答这个问题」。开启精排后，会先召回一批候选（默认 `max(topK×4, 20)`，上限 50），再用 cross-encoder 逐条判断相关性，只把过线的交给模型。

启用方式（`server/.env`）：

```ini
RERANK_ENABLED=true
RERANK_MIN_SCORE=0.1
```

模型默认 `BAAI/bge-reranker-v2-m3`，复用 `EMBEDDING_BASE_URL` / `EMBEDDING_API_KEY`（同一个硅基流动账号），不需要额外密钥。

`RERANK_MIN_SCORE` 的标定方式与相似度下限相同，先用 `RERANK_SHADOW=true` 收集分布（照常调用并记录 `rerankScores`，但结果仍用向量排序），再定阈值。**注意 rerank 分数与向量相似度不是一个尺度**：当前实测 bge-reranker-v2-m3 通过硅基流动返回的是归一化到 0~1 的分数，相关约 0.26~0.99，无关约 0.001~0.007。

一次实测（4 份文档 / 34 分块 / 10 条评估题，`npm run eval`）：

| | 精排关 | 精排开 + 阈值 0.1 |
| --- | --- | --- |
| 有答案的题 recall@5 | 8/8 | 8/8 |
| 库里没有的题正确拒答 | **0/2** | **2/2** |
| 每题进入提示词的分块数 | 5 | 1~4 |
| 单次检索耗时 | ~290ms | ~900ms |

代价是首字延迟增加数百毫秒。文档多、检索预算大时收益更明显；如果只有几十个分块，`RETRIEVAL_MIN_SCORE` 调高往往就够，可以先不开精排。

评估工具：`cd server && npm run eval`，读取 `server/eval/dataset.json`，输出 recall@k / MRR / 拒答率，报告写到 `server/eval/reports/`（已在 `.gitignore` 中）。

### 长对话摘要

发给模型的历史只保留最近 10 条消息。更早的内容会被压缩成一段摘要（`conversations.summary`），随提示词一起传下去，所以长对话不会在第 6 轮之后「忘记」前面说过什么。

- **怎么触发**：每次回答结束后（不阻塞响应）检查一次——滑出窗口的消息、且还没被摘要覆盖的，累积到 6 条以上就重新合并摘要。摘要会写回对话，并记录覆盖到哪条消息（`summary_until_message_id`），下次只处理新增部分。
- **成本**：平均每 3 轮对话多一次模型调用，计入 `usage_logs` 的 `summary` 类型。
- **失败处理**：摘要生成失败只记日志，保留旧摘要，不影响问答。
- **重新生成/编辑消息**会让旧摘要作废（因为它可能引用了已被删除的内容），下次重新累积。
- 相关参数在 `server/src/config.ts` 的 `chat` 段：`maxHistoryMessages`、`summaryMinMessages`、`summaryMaxChars`、`summaryInputChars`。

## 部署

推荐结构：nginx 托管前端构建产物并反代 `/api`；后端和 Qdrant 只监听 127.0.0.1；MySQL 不对外。`deploy/` 下有可直接修改使用的模板：

| 文件 | 用途 |
| --- | --- |
| `personal-knowledge.service` | 后端的 systemd 服务（`npm run start`） |
| `qdrant.service` | Qdrant 官方 Linux 二进制的 systemd 服务，只绑定 127.0.0.1 |
| `nginx-knowledge.conf` | 80 跳转 443，静态文件 + `/api` 反代（SSE 不缓冲、传 `Host`）、安全响应头 |
| `backup.sh` | 每日备份 MySQL 和上传文件，保留最近 14 份 |

要点：

- 反代必须原样传递 `Host`（后端按它做同源校验），并设置 `X-Forwarded-Proto`（后端已 `trust proxy` 回环地址，Cookie 才会带 `Secure`）。必须用 HTTPS。
- 前端是单页应用：`/chat`、`/notes` 这类页面地址由前端路由处理，静态服务器必须把未命中的路径回退到 `index.html`（模板里是 `try_files $uri /index.html`），否则刷新或直接访问这些地址会 404。
- 前端：本机 `pnpm build`，把 `dist/` 上传到服务器；后端：上传 `server/`（不含 `node_modules`、`.env`、`uploads`），`npm ci` 后 `systemctl restart personal-knowledge`；有新迁移时先 `npm run migrate`。
- 不要把 Qdrant（6333/6334）和 MySQL（3306）绑定到公网。若用 Docker 运行 Qdrant，端口映射写成 `127.0.0.1:6333:6333`。
- 内存紧张的小机器建议加 swap；两个 systemd 服务都设了 `MemoryMax`。
- 日志为 JSON 行：`journalctl -u personal-knowledge -o cat | grep '"event":"request"'`；问答另有 `"event":"chat"`（含检索命中、耗时、token，不含问题与回答内容）。

### 备份与恢复

- 备份：`crontab -e` 加 `30 3 * * * /opt/personal-knowledge/deploy/backup.sh >> /var/log/pk-backup.log 2>&1`。产物在 `/var/backups/personal-knowledge/`（`db-*.sql.gz`、`uploads-*.tgz`）。建议再定期拷贝一份到别的机器。
- 恢复：`gunzip -c db-xxx.sql.gz | mysql -u... 库名`；`tar xzf uploads-xxx.tgz -C server/`；然后运行 `npm run reindex` 重建向量。
- 向量不进备份：它可以由数据库里的分块完整重建。

## 文档

- [DESIGN.md](./DESIGN.md)：视觉与页面结构设计规范
- [TODO.md](./TODO.md)：分阶段实施计划
