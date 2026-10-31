export type KnowledgeDocument = {
  name: string;
  type: string;
  size: string;
  updated: string;
  status: "完成" | "处理中" | "等待处理" | "处理失败";
};

export type KnowledgeBase = {
  id: number;
  name: string;
  description: string;
  documents: number;
  updated: string;
  cover: "blue" | "purple" | "orange" | "green";
  items: KnowledgeDocument[];
};

export type Note = {
  id: number;
  title: string;
  content: string;
  category: string;
  tags: string[];
  updated: string;
};
