import { ArrowUp, BookOpen, FileText, FolderPlus, MessageSquareText, Upload } from "lucide-react";

type DashboardProps = { onNavigate: (page: string) => void };

const shortcuts = [
  { label: "上传资料", icon: Upload, target: "我的知识库" },
  { label: "新建笔记", icon: FileText, target: "我的笔记" },
  { label: "创建知识库", icon: FolderPlus, target: "我的知识库" },
];

const recents = [
  { title: "RAG 检索优化", detail: "我的笔记 · 12 分钟前编辑", icon: FileText, target: "我的笔记" },
  { title: "Transformer 的注意力机制", detail: "AI 对话 · 昨天", icon: MessageSquareText, target: "AI 对话" },
  { title: "Deep Learning Notes", detail: "机器学习 · 37 个文档", icon: BookOpen, target: "我的知识库" },
];

export function Dashboard({ onNavigate }: DashboardProps) {
  return (
    <div className="home">
      <h1 className="home-title">早上好，Lenovo</h1>
      <p className="home-sub">让每一次阅读，成为可检索的长期记忆。</p>

      {/* 提问入口：点击进入 AI 对话页 */}
      <button className="home-ask" type="button" onClick={() => onNavigate("AI 对话")}>
        <span>向你的知识库提问…</span>
        <span className="home-ask-send"><ArrowUp size={18} /></span>
      </button>

      <div className="home-chips">
        {shortcuts.map(({ label, icon: Icon, target }) => (
          <button className="home-chip" type="button" key={label} onClick={() => onNavigate(target)}>
            <Icon size={16} /> {label}
          </button>
        ))}
      </div>

      <section className="home-recent" aria-label="最近">
        <h2>最近</h2>
        {recents.map(({ title, detail, icon: Icon, target }) => (
          <button className="home-recent-item" type="button" key={title} onClick={() => onNavigate(target)}>
            <Icon size={17} />
            <span>{title}</span>
            <small>{detail}</small>
          </button>
        ))}
      </section>
    </div>
  );
}
