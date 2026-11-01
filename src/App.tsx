import { useEffect, useState, type ComponentType } from "react";
import { ChevronLeft, ChevronRight, FileText, Grid2X2, LibraryBig, Menu, MessageSquareText, Moon, MoreHorizontal, Settings2, ShieldCheck, Sparkles, Sun, UserRound, X } from "lucide-react";
import "./App.css";
import "./shell.css";
import "./theme.css";
import { Dashboard } from "@/pages/Dashboard";
import { ChatPage } from "@/pages/ChatPage";
import { KnowledgePage } from "@/pages/KnowledgePage";
import { NotesPage } from "@/pages/NotesPage";
import { ProfilePage } from "@/pages/ProfilePage";
import { AdminPage } from "@/pages/AdminPage";
import { DocumentReader } from "@/components/DocumentReader";
import { ConversationList } from "@/components/ConversationList";
import { getSettings } from "@/lib/api";
import { useAuthStore } from "@/lib/auth-store";
import { useChatStore } from "@/lib/chat-store";
import { useNoteNavStore } from "@/lib/note-nav-store";
import { useReaderStore } from "@/lib/reader-store";

type NavItem = {
  label: string;
  icon: ComponentType<{ size?: number; strokeWidth?: number }>;
};

const navItems: NavItem[] = [
  { label: "工作台", icon: Grid2X2 },
  { label: "AI 对话", icon: MessageSquareText },
  { label: "我的知识库", icon: LibraryBig },
  { label: "我的笔记", icon: FileText },
  { label: "个人中心", icon: UserRound },
];

function App() {
  const [isDark, setIsDark] = useState(() => {
    const saved = localStorage.getItem("theme");
    return saved ? saved === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
  });
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [activeNav, setActiveNav] = useState("工作台");
  const displayName = useAuthStore((state) => state.user?.displayName ?? "");
  const isAdmin = useAuthStore((state) => state.user?.isAdmin ?? false);
  // 管理入口只对管理员显示（后端接口另有校验）
  const visibleNavItems = isAdmin ? [...navItems, { label: "管理", icon: ShieldCheck }] : navItems;

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
  }, [isDark]);

  // 登录后应用个人中心里设置的默认知识库范围；读取失败就保持“全部知识库”
  useEffect(() => {
    getSettings()
      .then(({ defaultKnowledgeBaseIds }) => {
        if (defaultKnowledgeBaseIds.length > 0) useChatStore.getState().setKnowledgeBaseIds(defaultKnowledgeBaseIds);
      })
      .catch(console.error);
  }, []);

  // 从阅读抽屉或对话菜单跳到笔记页并选中某篇笔记
  const openNote = (id: number) => {
    useNoteNavStore.getState().request(id);
    useReaderStore.getState().close();
    setActiveNav("我的笔记");
    setIsSidebarOpen(false);
  };

  // 从阅读抽屉里的推荐问题跳到新对话：范围限定为该文档所在知识库，问题填进输入框由用户确认后发送
  const askQuestion = (question: string, knowledgeBaseId: number) => {
    const chat = useChatStore.getState();
    chat.newConversation();
    chat.setKnowledgeBaseIds([knowledgeBaseId]);
    chat.setPendingQuestion(question);
    useReaderStore.getState().close();
    setActiveNav("AI 对话");
    setIsSidebarOpen(false);
  };

  const changeTheme = (dark: boolean) => {
    setIsDark(dark);
    localStorage.setItem("theme", dark ? "dark" : "light");
  };

  const isBleed = activeNav === "AI 对话" || activeNav === "我的知识库" || activeNav === "我的笔记";

  return (
    <div className={`app-shell${isCollapsed ? " sidebar-collapsed" : ""}`}>
      <button
        className="mobile-menu-button"
        type="button"
        aria-label="打开导航菜单"
        onClick={() => setIsSidebarOpen(true)}
      >
        <Menu size={20} />
      </button>

      <aside className={`sidebar${isSidebarOpen ? " is-open" : ""}`} aria-label="主导航">
        <div className="sidebar-header">
          <div className="brand">
            <div className="brand-mark" aria-hidden="true"><Sparkles size={17} /></div>
            <span>Personal Knowledge</span>
          </div>
          <button className="sidebar-close" type="button" aria-label="关闭导航菜单" onClick={() => setIsSidebarOpen(false)}>
            <X size={19} />
          </button>
        </div>

        <nav className="nav-list">
          {visibleNavItems.map(({ label, icon: Icon }) => (
            <button
              className={`nav-item${activeNav === label ? " active" : ""}`}
              type="button"
              key={label}
              onClick={() => { setActiveNav(label); setIsSidebarOpen(false); }}
            >
              <Icon size={19} strokeWidth={1.8} />
              <span>{label}</span>
            </button>
          ))}
        </nav>

        {activeNav === "AI 对话" && <ConversationList onPick={() => setIsSidebarOpen(false)} onOpenNote={openNote} />}

        <div className="sidebar-bottom">
          <button className="nav-item" type="button" aria-label={isDark ? "切换至浅色模式" : "切换至深色模式"} onClick={() => changeTheme(!isDark)}>
            {isDark ? <Sun size={19} strokeWidth={1.8} /> : <Moon size={19} strokeWidth={1.8} />}
            <span>{isDark ? "浅色模式" : "深色模式"}</span>
          </button>
          <button className="nav-item" type="button" onClick={() => setActiveNav("个人中心")}>
            <Settings2 size={19} strokeWidth={1.8} />
            <span>设置</span>
          </button>
          <button className="profile-button" type="button">
            <span className="avatar">{displayName.slice(0, 1).toUpperCase()}</span>
            <span className="profile-copy"><strong>{displayName}</strong><small>个人空间</small></span>
            <MoreHorizontal size={18} />
          </button>
        </div>
      </aside>

      {isSidebarOpen && <button className="sidebar-scrim" type="button" aria-label="关闭导航菜单" onClick={() => setIsSidebarOpen(false)} />}

      <main className="main-content">
        {isBleed ? (
          <div className="page-bleed">{activeNav === "AI 对话" ? <ChatPage /> : activeNav === "我的知识库" ? <KnowledgePage /> : <NotesPage onNavigate={setActiveNav} />}</div>
        ) : (
          <div className="page-scroll">
            {activeNav === "工作台" ? <Dashboard onNavigate={setActiveNav} /> : activeNav === "个人中心" ? <ProfilePage isDark={isDark} onThemeChange={changeTheme} /> : activeNav === "管理" && isAdmin ? <AdminPage /> : <PlaceholderPage page={activeNav} />}
          </div>
        )}
      </main>

      <DocumentReader onOpenNote={openNote} onAsk={askQuestion} />

      <button className="sidebar-toggle" type="button" aria-label="折叠侧边栏" onClick={() => setIsCollapsed((value) => !value)}>
        {isCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
      </button>
    </div>
  );
}

function PlaceholderPage({ page }: { page: string }) {
  return <div className="placeholder-page"><span className="placeholder-icon"><Sparkles size={25} /></span><p className="section-kicker">正在构建</p><h2>{page}</h2><p>该模块将按照既定设计规范在下一阶段接入。</p></div>;
}

export default App;
