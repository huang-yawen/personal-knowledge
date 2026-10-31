import { BookOpen, ChevronRight, LibraryBig, MessageSquareText, MoreHorizontal, Plus, Search, Sparkles } from "lucide-react";
import { Thread } from "@/components/assistant-ui/elements/thread.aui";
import { MyRuntimeProvider } from "@/MyRuntimeProvider";

export function ChatPage() {
  return (
    <div className="chat-page">
      <div className="chat-toolbar">
        <button className="library-selector" type="button"><LibraryBig size={16} /><span>全部知识库</span><ChevronRight size={15} /></button>
        <p>回答将优先基于你已导入的资料</p>
        <button className="chat-new-button" type="button"><Plus size={16} /> 新建对话</button>
      </div>
      <div className="chat-workspace">
        <aside className="conversation-panel">
          <div className="conversation-panel-head"><span>对话历史</span><button type="button" aria-label="搜索对话"><Search size={16} /></button></div>
          <div className="conversation-group"><p>今天</p><button className="conversation-item is-selected" type="button"><MessageSquareText size={15} /><span>Transformer 的注意力机制</span></button><button className="conversation-item" type="button"><MessageSquareText size={15} /><span>RAG 的检索效果如何优化？</span></button></div>
          <div className="conversation-group"><p>昨天</p><button className="conversation-item" type="button"><MessageSquareText size={15} /><span>整理深度学习学习路径</span></button><button className="conversation-item" type="button"><MessageSquareText size={15} /><span>总结这篇论文的关键结论</span></button></div>
        </aside>
        <section className="chat-thread-shell" aria-label="AI 对话">
          <MyRuntimeProvider><Thread components={{ Welcome: ChatWelcome }} /></MyRuntimeProvider>
        </section>
        <aside className="citation-panel">
          <div className="citation-head"><span>对话信息</span><button type="button" aria-label="更多选项"><MoreHorizontal size={18} /></button></div>
          <div className="citation-empty"><span className="citation-empty-icon"><BookOpen size={19} /></span><h3>等待引用来源</h3><p>在知识库范围内提问后，相关的资料来源会在这里呈现。</p></div>
          <div className="chat-tips"><Sparkles size={16} /><p>小提示：选择特定知识库可以让回答更加聚焦。</p></div>
        </aside>
      </div>
    </div>
  );
}

function ChatWelcome() {
  return (
    <div className="chat-welcome">
      <span className="chat-welcome-mark"><Sparkles size={21} /></span>
      <h2>今天想探索什么？</h2>
      <p>我可以基于你的知识库回答问题、解释概念，或帮你整理思路。</p>
      <div className="prompt-grid"><span>总结一篇资料的核心观点</span><span>解释一个复杂概念</span><span>从笔记中提炼关键要点</span><span>比较两个相关的技术方案</span></div>
    </div>
  );
}
