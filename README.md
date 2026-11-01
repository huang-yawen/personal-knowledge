# Personal Knowledge

个人知识库平台：导入资料 → 建立可检索知识库 → 基于资料问答 → 沉淀笔记。

## 当前状态

- 前后端已全部接入真实数据：工作台、AI 对话、我的知识库、我的笔记、个人中心（账号、AI 设置、使用统计、数据导出与账号删除）。
- 多用户：用户名 + 密码登录，注册需要一次性邀请码；每个用户的数据相互隔离。
- 每用户有限流与每日 token 额度、文档数与存储量配额（默认值见 `server/.env.example`）。

## 技术栈

- 前端：React 19 + TypeScript + Vite + Tailwind CSS 4 + shadcn/ui（Base UI）+ assistant-ui + zustand
- 后端（`server/`）：Express 5 + MySQL + Qdrant；Embedding 走 OpenAI 兼容接口，对话模型为 DeepSeek

## 开发

```bash
pnpm install
pnpm dev      # 启动开发服务器
pnpm build    # 类型检查并构建
pnpm lint     # oxlint 检查
```

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
