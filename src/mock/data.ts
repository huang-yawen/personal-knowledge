import { Archive, FileText, LibraryBig, MessageSquareText, Upload } from "lucide-react";
import type { Note } from "@/types";

export const initialNotes: Note[] = [
  { id: 1, title: "RAG 检索优化", category: "机器学习", tags: ["RAG", "检索"], updated: "12 分钟前", content: "# RAG 检索优化\n\n检索增强生成的效果，通常取决于 **数据质量、切块策略和检索排序** 三个层面。\n\n## 核心思路\n\n- 使用语义完整的文本分段，而不是固定长度截断\n- 在向量检索前加入元数据过滤\n- 对初步召回的内容使用 rerank 重排序\n\n> 回答必须可以回溯到真实的原始资料。\n\n## 下一步\n\n补充不同 chunk size 对召回效果的实验记录。" },
  { id: 2, title: "Transformer 注意力机制", category: "机器学习", tags: ["Transformer", "模型"], updated: "昨天", content: "# Transformer 注意力机制\n\n注意力机制让模型能够动态计算序列元素之间的相关性。" },
  { id: 3, title: "个人知识系统的设计原则", category: "个人成长", tags: ["知识管理"], updated: "10 月 27 日", content: "# 个人知识系统的设计原则\n\n知识需要被持续使用，才能真正沉淀。" },
  { id: 4, title: "设计系统组件清单", category: "产品与设计", tags: ["设计系统", "UI"], updated: "10 月 24 日", content: "# 设计系统组件清单\n\n建立一致且可扩展的组件基础。" },
];

export const metrics = [
  { label: "知识库", value: "12", detail: "较上月 +2", icon: LibraryBig, color: "blue" },
  { label: "文档", value: "286", detail: "本周新增 14", icon: Archive, color: "orange" },
  { label: "笔记", value: "74", detail: "本周编辑 9", icon: FileText, color: "purple" },
];

export const activities = [
  { icon: FileText, color: "purple", title: "编辑了笔记", detail: "RAG 检索优化 · 12 分钟前" },
  { icon: Upload, color: "blue", title: "导入了文档", detail: "Deep Learning Notes.pdf · 2 小时前" },
  { icon: MessageSquareText, color: "orange", title: "完成了一次知识问答", detail: "关于 Transformer 的注意力机制 · 昨天" },
];
