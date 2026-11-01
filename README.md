# Personal Knowledge

个人知识库平台：导入资料 → 建立可检索知识库 → 基于资料问答 → 沉淀笔记。

## 当前状态

- 已接入真实后端：工作台（总览与轨迹）、AI 对话（基于知识库的流式问答、引用来源、会话管理、追问建议）、我的知识库（上传、处理状态、阅读视图）、我的笔记（自动保存、标签与分类、来源关联、AI 辅助）。
- 仍为 mock 数据：个人中心（对应 TODO 的 P4）。
- 单用户模式，使用固定开发用户，暂无登录。

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
```

`.env` 含密钥，不要提交到版本库。前端开发服务器通过 `/api` 访问后端。

## 文档

- [DESIGN.md](./DESIGN.md)：视觉与页面结构设计规范
- [TODO.md](./TODO.md)：分阶段实施计划
