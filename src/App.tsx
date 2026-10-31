import { useEffect, useState, type ComponentType } from "react";
import { Bell, ChevronLeft, ChevronRight, FileText, Grid2X2, LibraryBig, Menu, MessageSquareText, Moon, MoreHorizontal, Plus, Search, Settings2, Sparkles, Sun, UserRound, X } from "lucide-react";
import "./App.css";
import { Dashboard } from "@/pages/Dashboard";
import { ChatPage } from "@/pages/ChatPage";
import { KnowledgePage } from "@/pages/KnowledgePage";
import { NotesPage } from "@/pages/NotesPage";
import { ProfilePage } from "@/pages/ProfilePage";

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

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
  }, [isDark]);

  const changeTheme = (dark: boolean) => {
    setIsDark(dark);
    localStorage.setItem("theme", dark ? "dark" : "light");
  };

  const currentTitle = activeNav;

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

        <div className="sidebar-bottom">
          <button className="nav-item" type="button" onClick={() => setActiveNav("个人中心")}>
            <Settings2 size={19} strokeWidth={1.8} />
            <span>设置</span>
          </button>
          <button className="profile-button" type="button">
            <span className="avatar">L</span>
            <span className="profile-copy"><strong>Lenovo</strong><small>个人空间</small></span>
            <MoreHorizontal size={18} />
          </button>
        </div>
      </aside>

      {isSidebarOpen && <button className="sidebar-scrim" type="button" aria-label="关闭导航菜单" onClick={() => setIsSidebarOpen(false)} />}

      <main className="main-content">
        <header className="topbar">
          <div className="page-identity">
            <p className="eyebrow">个人知识空间</p>
            <h1>{currentTitle}</h1>
          </div>
          <div className="topbar-actions">
            <button className="icon-button search-button" type="button" aria-label="搜索"><Search size={19} /><span>搜索</span><kbd>⌘ K</kbd></button>
            <button className="icon-button" type="button" aria-label="通知"><Bell size={19} /></button>
            <button className="icon-button" type="button" aria-label={isDark ? "切换至浅色模式" : "切换至深色模式"} onClick={() => changeTheme(!isDark)}>
              {isDark ? <Sun size={19} /> : <Moon size={19} />}
            </button>
            <button className="create-button" type="button"><Plus size={18} /> <span>新建</span></button>
          </div>
        </header>

        {activeNav === "工作台" ? <Dashboard /> : activeNav === "AI 对话" ? <ChatPage /> : activeNav === "我的知识库" ? <KnowledgePage /> : activeNav === "我的笔记" ? <NotesPage /> : activeNav === "个人中心" ? <ProfilePage isDark={isDark} onThemeChange={changeTheme} /> : <PlaceholderPage page={activeNav} />}
      </main>

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
