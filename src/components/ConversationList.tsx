import { useEffect } from "react";
import { MessageSquarePlus, Trash2 } from "lucide-react";
import { useChatStore } from "@/lib/chat-store";

// 按更新日期把对话分成 今天 / 昨天 / 更早
const dayGroup = (iso: string) => {
  const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const days = Math.round((startOfDay(new Date()) - startOfDay(new Date(iso))) / 86400000);
  return days <= 0 ? "今天" : days === 1 ? "昨天" : "更早";
};

// 侧边栏里的对话历史（仿 ChatGPT），只在 AI 对话页显示
export function ConversationList({ onPick }: { onPick: () => void }) {
  const { conversations, conversationId, loadConversations, openConversation, newConversation, removeConversation } = useChatStore();

  useEffect(() => {
    loadConversations().catch(console.error);
  }, [loadConversations]);

  const groups = ["今天", "昨天", "更早"]
    .map((label) => ({ label, items: conversations.filter((item) => dayGroup(item.updatedAt) === label) }))
    .filter((group) => group.items.length > 0);

  return (
    <div className="sidebar-conversations">
      <button className="conversation-new" type="button" onClick={() => { newConversation(); onPick(); }}>
        <MessageSquarePlus size={18} strokeWidth={1.8} /> 新建对话
      </button>
      {groups.length === 0 && <p className="conversation-empty">还没有对话，提问后会自动保存在这里。</p>}
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
    </div>
  );
}
