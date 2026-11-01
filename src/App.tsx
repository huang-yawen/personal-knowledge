import { useEffect, useState, type ComponentType } from "react";
import { ChevronLeft, ChevronRight, FileText, Grid2X2, LibraryBig, Menu, MessageSquareText, Moon, MoreHorizontal, Settings2, Sparkles, Sun, UserRound, X } from "lucide-react";
import "./App.css";
import "./shell.css";
import "./theme.css";
import { Dashboard } from "@/pages/Dashboard";
import { ChatPage } from "@/pages/ChatPage";
import { KnowledgePage } from "@/pages/KnowledgePage";
import { NotesPage } from "@/pages/NotesPage";
import { ProfilePage } from "@/pages/ProfilePage";
import { DocumentReader } from "@/components/DocumentReader";
import { ConversationList } from "@/components/ConversationList";
import { useAuthStore } from "@/lib/auth-store";
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

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
  }, [isDark]);

  // 从阅读抽屉或对话菜单跳到笔记页并选中某篇笔记
  const openNote = (id: number) => {
    useNoteNavStore.getState().request(id);
    useReaderStore.getState().close();
    setActiveNav("我的笔记");
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
          {navItems.map(({ label, icon: Icon }) => (
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
            {activeNav === "工作台" ? <Dashboard onNavigate={setActiveNav} /> : activeNav === "个人中心" ? <ProfilePage isDark={isDark} onThemeChange={changeTheme} /> : <PlaceholderPage page={activeNav} />}
          </div>
        )}
      </main>

      <DocumentReader onOpenNote={openNote} />

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
