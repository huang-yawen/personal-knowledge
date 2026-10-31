# Personal Knowledge

个人知识库平台：导入资料 → 建立可检索知识库 → 基于资料问答 → 沉淀笔记。

## 当前状态

仅前端原型：工作台、AI 对话、我的知识库、我的笔记、个人中心均使用 mock 数据，AI 对话为本地演示适配器，尚未接入后端。

## 技术栈

React 19 + TypeScript + Vite + Tailwind CSS 4 + shadcn/ui（Base UI）+ assistant-ui

## 开发

```bash
pnpm install
pnpm dev      # 启动开发服务器
pnpm build    # 类型检查并构建
pnpm lint     # oxlint 检查
```

## 文档

- [DESIGN.md](./DESIGN.md)：视觉与页面结构设计规范
- [TODO.md](./TODO.md)：分阶段实施计划
