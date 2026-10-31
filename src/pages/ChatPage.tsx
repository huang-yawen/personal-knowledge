import { useEffect, useState } from "react";
import {
  BookOpen,
  LibraryBig,
  MessageSquareText,
  MoreHorizontal,
  Plus,
  Search,
  Sparkles,
  Trash2,
} from "lucide-react";
import { Thread } from "@/components/assistant-ui/elements/thread.aui";
import { listKnowledgeBases, type KnowledgeBaseDto } from "@/lib/api";
import { useChatStore } from "@/lib/chat-store";
import { MyRuntimeProvider } from "@/MyRuntimeProvider";

// 按更新日期把对话分成 今天 / 昨天 / 更早
const dayGroup = (iso: string) => {
  const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const days = Math.round((startOfDay(new Date()) - startOfDay(new Date(iso))) / 86400000);
  return days <= 0 ? "今天" : days === 1 ? "昨天" : "更早";
};

export function ChatPage() {
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBaseDto[]>([]);
  const {
    knowledgeBaseId,
    setKnowledgeBaseId,
    sources,
    conversations,
    conversationId,
    threadKey,
    initialMessages,
    loadConversations,
    openConversation,
    newConversation,
    removeConversation,
  } = useChatStore();

  useEffect(() => {
    listKnowledgeBases().then(setKnowledgeBases).catch(console.error);
    loadConversations().catch(console.error);
  }, [loadConversations]);

  const groups = ["今天", "昨天", "更早"]
    .map((label) => ({ label, items: conversations.filter((item) => dayGroup(item.updatedAt) === label) }))
    .filter((group) => group.items.length > 0);

  return (
    <div className="chat-page">
      <div className="chat-toolbar">
        <label className="library-selector">
          <LibraryBig size={16} />
          <select
            aria-label="知识库范围"
            value={knowledgeBaseId ?? ""}
            onChange={(event) => setKnowledgeBaseId(event.target.value ? Number(event.target.value) : null)}
          >
            <option value="">全部知识库</option>
            {knowledgeBases.map((base) => (
              <option key={base.id} value={base.id}>
                {base.name}
              </option>
            ))}
          </select>
        </label>
        <p>回答将优先基于你已导入的资料</p>
        <button className="chat-new-button" type="button" onClick={newConversation}>
          <Plus size={16} /> 新建对话
        </button>
      </div>
      <div className="chat-workspace">
        <aside className="conversation-panel">
          <div className="conversation-panel-head">
            <span>对话历史</span>
            <button type="button" aria-label="搜索对话">
              <Search size={16} />
            </button>
          </div>
          {groups.length === 0 && <p className="conversation-empty">还没有对话，提问后会自动保存在这里。</p>}
          {groups.map((group) => (
            <div className="conversation-group" key={group.label}>
              <p>{group.label}</p>
              {group.items.map((item) => (
                <div className="conversation-row" key={item.id}>
                  <button
                    className={`conversation-item${item.id === conversationId ? " is-selected" : ""}`}
                    type="button"
                    onClick={() => openConversation(item.id).catch(console.error)}
                  >
                    <MessageSquareText size={15} />
                    <span>{item.title}</span>
                  </button>
                  <button
                    className="conversation-delete"
                    type="button"
                    aria-label={`删除对话 ${item.title}`}
                    onClick={() => {
                      if (window.confirm(`确定删除对话“${item.title}”吗？删除后无法恢复。`)) {
                        removeConversation(item.id).catch(console.error);
                      }
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          ))}
        </aside>
        <section className="chat-thread-shell" aria-label="AI 对话">
          <MyRuntimeProvider key={threadKey} initialMessages={initialMessages}>
            <Thread components={{ Welcome: ChatWelcome }} />
          </MyRuntimeProvider>
        </section>
        <aside className="citation-panel">
          <div className="citation-head">
            <span>对话信息</span>
            <button type="button" aria-label="更多选项">
              <MoreHorizontal size={18} />
            </button>
          </div>
          {sources.length > 0 ? (
            <div className="citation-list">
              {sources.map((source) => (
                <details className="citation-item" key={source.chunkId}>
                  <summary>
                    <span className="citation-index">{source.index}</span>
                    <span className="citation-title">{source.documentName}</span>
                    <small>
                      {source.page ? `第 ${source.page} 页 · ` : ""}相似度 {source.score.toFixed(2)}
                    </small>
                  </summary>
                  <p>{source.content}</p>
                </details>
              ))}
            </div>
          ) : (
            <div className="citation-empty">
              <span className="citation-empty-icon">
                <BookOpen size={19} />
              </span>
              <h3>等待引用来源</h3>
              <p>在知识库范围内提问后，相关的资料来源会在这里呈现。</p>
            </div>
          )}
          <div className="chat-tips">
            <Sparkles size={16} />
            <p>小提示：选择特定知识库可以让回答更加聚焦。</p>
          </div>
        </aside>
      </div>
    </div>
  );
}

function ChatWelcome() {
  return (
    <div className="chat-welcome">
      <span className="chat-welcome-mark">
        <Sparkles size={21} />
      </span>
      <h2>今天想探索什么？</h2>
      <p>我可以基于你的知识库回答问题、解释概念，或帮你整理思路。</p>
      <div className="prompt-grid">
        <span>总结一篇资料的核心观点</span>
        <span>解释一个复杂概念</span>
        <span>从笔记中提炼关键要点</span>
        <span>比较两个相关的技术方案</span>
      </div>
    </div>
  );
}
