export type KnowledgeDocument = {
  id: number;
  name: string;
  type: string;
  size: string;
  updated: string;
  status: "完成" | "处理中" | "等待处理" | "处理失败";
  errorMessage: string | null;
  // 由笔记生成的文档
  fromNote?: boolean;
};

export type KnowledgeBase = {
  id: number;
  name: string;
  description: string;
  // 未经“尚未添加描述”占位处理的原始值，编辑时使用
  rawDescription: string;
  instructions: string;
  documents: number;
  updated: string;
  cover: "blue" | "purple" | "orange" | "green";
};

export type Note = {
  id: number;
  title: string;
  content: string;
  category: string;
  tags: string[];
  updated: string;
};
