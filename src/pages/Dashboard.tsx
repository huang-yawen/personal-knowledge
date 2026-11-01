import { useEffect, useState } from "react";
import { CircleAlert, FolderPlus, MessageSquarePlus, RotateCw, Upload } from "lucide-react";
import {
  getOverview,
  listActivities,
  listConversations,
  retryDocument,
  type ActivityDto,
  type ActivityType,
  type ConversationDto,
  type OverviewDto,
} from "@/lib/api";
import { useChatStore } from "@/lib/chat-store";
import { useAuthStore } from "@/lib/auth-store";
import { useNoteNavStore } from "@/lib/note-nav-store";
import { useReaderStore } from "@/lib/reader-store";

type DashboardProps = { onNavigate: (page: string) => void };

const PAGE_SIZE = 30;

// 轨迹里每种事件的类型文字
const activityLabels: Record<ActivityType, string> = {
  kb_created: "创建知识库",
  doc_uploaded: "上传资料",
  doc_ready: "处理完成",
  doc_failed: "处理失败",
  conversation_started: "开始对话",
  note_created: "新建笔记",
};

const greeting = () => {
  const hour = new Date().getHours();
  return hour < 6 ? "夜深了" : hour < 12 ? "早上好" : hour < 18 ? "下午好" : "晚上好";
};

const pad = (value: number) => String(value).padStart(2, "0");

// 轨迹按月份分组，同月内保持倒序
const groupByMonth = (items: ActivityDto[]) => {
  const groups: { key: string; label: string; items: ActivityDto[] }[] = [];
  for (const item of items) {
    const date = new Date(item.createdAt);
    const key = `${date.getFullYear()}-${date.getMonth()}`;
    const last = groups.at(-1);
    if (last?.key === key) last.items.push(item);
    else groups.push({ key, label: `${date.getFullYear()} 年 ${date.getMonth() + 1} 月`, items: [item] });
  }
  return groups;
};

export function Dashboard({ onNavigate }: DashboardProps) {
  const displayName = useAuthStore((state) => state.user?.displayName ?? "");
  const [overview, setOverview] = useState<OverviewDto | null>(null);
  const [conversations, setConversations] = useState<ConversationDto[]>([]);
  const [activities, setActivities] = useState<ActivityDto[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState("");
  const openReader = useReaderStore((state) => state.open);
  const { openConversation, newConversation } = useChatStore();

  const loadOverview = () => getOverview().then(setOverview);

  useEffect(() => {
    Promise.all([getOverview(), listConversations(), listActivities()])
      .then(([nextOverview, nextConversations, nextActivities]) => {
        setOverview(nextOverview);
        setConversations(nextConversations.slice(0, 3));
        setActivities(nextActivities);
        setHasMore(nextActivities.length === PAGE_SIZE);
      })
      .catch((reason: Error) => setError(reason.message));
  }, []);

  const loadMore = () => {
    const last = activities.at(-1);
    listActivities(last?.id)
      .then((next) => {
        setActivities((items) => [...items, ...next]);
        setHasMore(next.length === PAGE_SIZE);
      })
      .catch((reason: Error) => setError(reason.message));
  };

  const retry = (id: number) => {
    retryDocument(id)
      .then(loadOverview)
      .catch((reason: Error) => setError(reason.message));
  };

  const goConversation = (id: number) => {
    openConversation(id)
      .then(() => onNavigate("AI 对话"))
      .catch((reason: Error) => setError(reason.message));
  };

  // 点击轨迹：处理完成的文档打开阅读，对话回到对话，其余去知识库
  const openActivity = (item: ActivityDto) => {
    if (item.type === "conversation_started" && item.refId) goConversation(item.refId);
    else if (item.type === "doc_ready" && item.refId) openReader(item.refId);
    else if (item.type === "note_created" && item.refId) {
      useNoteNavStore.getState().request(item.refId);
      onNavigate("我的笔记");
    }
    else onNavigate("我的知识库");
  };

  const stats = [
    { label: "知识库", value: overview?.knowledgeBases, target: "我的知识库" },
    { label: "文档", value: overview?.documents, target: "我的知识库" },
    { label: "对话", value: overview?.conversations, target: "AI 对话" },
  ];

  return (
    <div className="overview">
      <h1 className="home-title">{greeting()}，{displayName}</h1>
      <p className="home-sub">让每一次阅读，成为可检索的长期记忆。</p>
      {error && <p className="form-error overview-error" role="alert">{error}</p>}

      <div className="overview-stats">
        {stats.map((item) => (
          <button className="overview-stat" type="button" key={item.label} onClick={() => onNavigate(item.target)}>
            <strong>{item.value ?? "–"}</strong>
            <span>{item.label}</span>
          </button>
        ))}
      </div>

      <div className="home-chips">
        <button className="home-chip" type="button" onClick={() => onNavigate("我的知识库")}><Upload size={16} /> 上传资料</button>
        <button className="home-chip" type="button" onClick={() => onNavigate("我的知识库")}><FolderPlus size={16} /> 创建知识库</button>
        <button className="home-chip" type="button" onClick={() => { newConversation(); onNavigate("AI 对话"); }}>
          <MessageSquarePlus size={16} /> 新建对话
        </button>
      </div>

      {overview && overview.attention.length > 0 && (
        <section className="overview-section" aria-label="需要处理">
          <h2>需要处理</h2>
          {overview.attention.map((doc) => (
            <div className="attention-row" key={doc.id}>
              <CircleAlert size={17} className={doc.status === "failed" ? "is-failed" : undefined} />
              <div>
                <strong>{doc.name}</strong>
                <small>{doc.status === "failed" ? doc.errorMessage ?? "处理失败" : "正在处理中…"}</small>
              </div>
              {doc.status === "failed" && (
                <button className="mini-button" type="button" onClick={() => retry(doc.id)}><RotateCw size={13} /> 重试</button>
              )}
            </div>
          ))}
        </section>
      )}

      {conversations.length > 0 && (
        <section className="overview-section" aria-label="继续上次">
          <h2>继续上次</h2>
          {conversations.map((item) => (
            <button className="home-recent-item" type="button" key={item.id} onClick={() => goConversation(item.id)}>
              <span>{item.title}</span>
              <small>{new Date(item.updatedAt).toLocaleDateString("zh-CN")}</small>
            </button>
          ))}
        </section>
      )}

      <section className="overview-section" aria-label="轨迹">
        <h2>轨迹</h2>
        {activities.length === 0 && <p className="timeline-empty">还没有记录。创建知识库、上传资料、开始对话后，这里会留下你的足迹。</p>}
        {groupByMonth(activities).map((group) => (
          <div key={group.key}>
            <p className="timeline-month">{group.label}<small>{group.items.length} 条</small></p>
            {group.items.map((item) => {
              const date = new Date(item.createdAt);
              return (
                <button className="timeline-item" type="button" key={item.id} onClick={() => openActivity(item)}>
                  <time dateTime={item.createdAt}>{pad(date.getMonth() + 1)}/{pad(date.getDate())} {pad(date.getHours())}:{pad(date.getMinutes())}</time>
                  <em className={`timeline-tag ${item.type}`}>{activityLabels[item.type]}</em>
                  <span>{item.title}</span>
                </button>
              );
            })}
          </div>
        ))}
        {hasMore && <button className="timeline-more" type="button" onClick={loadMore}>加载更多</button>}
      </section>
    </div>
  );
}
