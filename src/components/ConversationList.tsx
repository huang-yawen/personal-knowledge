import { useEffect, useState } from "react";
import { Archive, FileText, MessageSquarePlus, MoreHorizontal, Pencil, Search, Star, Trash2 } from "lucide-react";
import { summarizeConversation, type ConversationDto } from "@/lib/api";
import { RelatedNotes } from "@/components/RelatedNotes";
import { useChatStore } from "@/lib/chat-store";

// 按更新日期把对话分成 今天 / 昨天 / 更早
const dayGroup = (iso: string) => {
  const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const days = Math.round((startOfDay(new Date()) - startOfDay(new Date(iso))) / 86400000);
  return days <= 0 ? "今天" : days === 1 ? "昨天" : "更早";
};

// 侧边栏里的对话历史（仿 ChatGPT），只在 AI 对话页显示
export function ConversationList({ onPick, onOpenNote }: { onPick: () => void; onOpenNote: (noteId: number) => void }) {
  const {
    conversations,
    conversationId,
    showArchived,
    loadConversations,
    setConversationFilter,
    openConversation,
    newConversation,
    patchConversation,
    removeConversation,
  } = useChatStore();
  const [search, setSearch] = useState("");
  const [menuId, setMenuId] = useState<number | null>(null);
  // 会话总结弹窗：text 为空表示生成中
  const [summary, setSummary] = useState<{ title: string; text?: string; error?: string } | null>(null);

  useEffect(() => {
    loadConversations().catch(console.error);
  }, [loadConversations]);

  // 输入停顿 250ms 后再请求，避免每个字符都查一次
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (search !== useChatStore.getState().conversationQuery) {
        setConversationFilter(search, useChatStore.getState().showArchived).catch(console.error);
      }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [search, setConversationFilter]);

  const groups = showArchived
    ? [{ label: "已归档", items: conversations }]
    : [
        { label: "收藏", items: conversations.filter((item) => item.isFavorite) },
        ...["今天", "昨天", "更早"].map((label) => ({
          label,
          items: conversations.filter((item) => !item.isFavorite && dayGroup(item.updatedAt) === label),
        })),
      ].filter((group) => group.items.length > 0);

  const run = (task: Promise<void>) => task.catch((reason: Error) => window.alert(reason.message));

  const rename = (item: ConversationDto) => {
    const title = window.prompt("重命名对话", item.title)?.trim();
    if (title && title !== item.title) run(patchConversation(item.id, { title }));
  };

  const summarize = (item: ConversationDto) => {
    setSummary({ title: item.title });
    summarizeConversation(item.id)
      .then((result) => setSummary({ title: item.title, text: result.summary }))
      .catch((reason: Error) => setSummary({ title: item.title, error: reason.message }));
  };

  const act = (action: () => void) => {
    setMenuId(null);
    action();
  };

  return (
    <div className="sidebar-conversations">
      <button className="conversation-new" type="button" onClick={() => { newConversation(); onPick(); }}>
        <MessageSquarePlus size={18} strokeWidth={1.8} /> 新建对话
      </button>
      <label className="conversation-search">
        <Search size={15} />
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索对话" aria-label="搜索对话" />
      </label>
      {conversations.length === 0 && (
        <p className="conversation-empty">{search ? "没有找到匹配的对话。" : showArchived ? "没有已归档的对话。" : "还没有对话，提问后会自动保存在这里。"}</p>
      )}
      {groups.map((group) => (
        <div className="conversation-group" key={group.label}>
          <p>{group.label}</p>
          {group.items.map((item) => (
            <div className="conversation-row" key={item.id}>
              <button
                className={`conversation-item${item.id === conversationId ? " is-selected" : ""}`}
                type="button"
                onClick={() => { openConversation(item.id).catch(console.error); onPick(); }}
              >
                <span>{item.title}</span>
              </button>
              <button
                className="conversation-more"
                type="button"
                aria-label={`更多操作 ${item.title}`}
                aria-haspopup="menu"
                onClick={() => setMenuId(menuId === item.id ? null : item.id)}
              >
                <MoreHorizontal size={15} />
              </button>
              {menuId === item.id && (
                <>
                  <button className="menu-backdrop" type="button" aria-label="关闭菜单" onClick={() => setMenuId(null)} />
                  <div className="conversation-menu" role="menu">
                    <button type="button" role="menuitem" onClick={() => act(() => rename(item))}><Pencil size={14} /> 重命名</button>
                    <RelatedNotes type="conversation" refId={item.id} onOpen={(noteId) => act(() => onOpenNote(noteId))} />
                    <button type="button" role="menuitem" onClick={() => act(() => summarize(item))}><FileText size={14} /> 生成总结</button>
                    <button type="button" role="menuitem" onClick={() => act(() => run(patchConversation(item.id, { isFavorite: !item.isFavorite })))}>
                      <Star size={14} /> {item.isFavorite ? "取消收藏" : "收藏"}
                    </button>
                    <button type="button" role="menuitem" onClick={() => act(() => run(patchConversation(item.id, { archived: !item.archived })))}>
                      <Archive size={14} /> {item.archived ? "取消归档" : "归档"}
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      className="is-danger"
                      onClick={() =>
                        act(() => {
                          if (window.confirm(`确定删除对话“${item.title}”吗？删除后无法恢复。`)) run(removeConversation(item.id));
                        })
                      }
                    >
                      <Trash2 size={14} /> 删除
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      ))}
      <button className="conversation-archive-toggle" type="button" onClick={() => setConversationFilter(search, !showArchived).catch(console.error)}>
        <Archive size={14} /> {showArchived ? "返回对话" : "已归档的对话"}
      </button>
      {summary && (
        <div className="summary-overlay" role="dialog" aria-label="对话总结" onClick={() => setSummary(null)}>
          <div className="summary-dialog" onClick={(event) => event.stopPropagation()}>
            <h3>{summary.title}</h3>
            <p className={summary.error ? "summary-error" : undefined}>{summary.error ?? summary.text ?? "正在生成总结…"}</p>
            <div className="summary-actions">
              {summary.text && (
                <button type="button" onClick={() => navigator.clipboard.writeText(summary.text ?? "").catch(console.error)}>复制</button>
              )}
              <button type="button" onClick={() => setSummary(null)}>关闭</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
