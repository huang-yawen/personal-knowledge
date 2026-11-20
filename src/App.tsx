import { Suspense, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Menu, Moon, MoreHorizontal, Settings2, Sparkles, Sun, X } from "lucide-react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import "./App.css";
import "./shell.css";
import "./theme.css";
import { DocumentReader } from "@/components/DocumentReader";
import { ConversationList } from "@/components/ConversationList";
import { ADMIN_NAV_ITEM, APP_NAME, NAV_ITEMS, findNavItem } from "@/lib/nav";
import { pageKeyByPath, prefetchPage } from "@/lib/pages";
import { getSettings } from "@/lib/api";
import { useAuthStore } from "@/lib/auth-store";
import { useChatStore } from "@/lib/chat-store";
import { useNoteNavStore } from "@/lib/note-nav-store";
import { useReaderStore } from "@/lib/reader-store";
import { useThemeStore } from "@/lib/theme-store";

// 应用壳：侧栏 + 主内容区。当前页面由路由决定，页面本身在 <Outlet /> 里渲染
function App() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const displayName = useAuthStore((state) => state.user?.displayName ?? "");
  const isAdmin = useAuthStore((state) => state.user?.isAdmin ?? false);
  const isDark = useThemeStore((state) => state.isDark);
  const toggleTheme = useThemeStore((state) => state.toggle);
  const { pathname } = useLocation();
  const navigate = useNavigate();

  const navItems = isAdmin ? [...NAV_ITEMS, ADMIN_NAV_ITEM] : NAV_ITEMS;
  const currentNav = findNavItem(pathname);
  // 对话历史只属于对话页，放在侧栏里跟着对话页出现（用匹配结果判断，兼容 /chat/ 这种带尾斜杠的地址）
  const showConversations = currentNav?.path === "/chat";

  // 标签页标题跟着路由走
  useEffect(() => {
    document.title = currentNav ? `${currentNav.title} · ${APP_NAME}` : APP_NAME;
  }, [currentNav]);

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
    navigate("/notes");
    setIsSidebarOpen(false);
  };

  // 从阅读抽屉里的推荐问题跳到新对话：范围限定为该文档所在知识库，问题填进输入框由用户确认后发送
  const askQuestion = (question: string, knowledgeBaseId: number) => {
    const chat = useChatStore.getState();
    chat.newConversation();
    chat.setKnowledgeBaseIds([knowledgeBaseId]);
    chat.setPendingQuestion(question);
    useReaderStore.getState().close();
    navigate("/chat");
    setIsSidebarOpen(false);
  };

  // 悬停或聚焦导航时预取目标页面的代码，点击时通常已下载完成
  const prefetchNav = (path: string) => {
    const key = pageKeyByPath[path];
    if (key) prefetchPage(key);
  };

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
          {navItems.map(({ path, label, icon: Icon }) => (
            <NavLink
              key={path}
              to={path}
              end={path === "/"}
              className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}
              onClick={() => setIsSidebarOpen(false)}
              onMouseEnter={() => prefetchNav(path)}
              onFocus={() => prefetchNav(path)}
            >
              <Icon size={19} strokeWidth={1.8} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        {showConversations && <ConversationList onPick={() => setIsSidebarOpen(false)} onOpenNote={openNote} />}

        <div className="sidebar-bottom">
          <button className="nav-item" type="button" aria-label={isDark ? "切换至浅色模式" : "切换至深色模式"} onClick={toggleTheme}>
            {isDark ? <Sun size={19} strokeWidth={1.8} /> : <Moon size={19} strokeWidth={1.8} />}
            <span>{isDark ? "浅色模式" : "深色模式"}</span>
          </button>
          <button className="nav-item" type="button" onClick={() => { navigate("/profile"); setIsSidebarOpen(false); }}>
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
        {/* 页面按路由懒加载，首次进入某页时先显示占位，侧栏保持可用 */}
        <Suspense fallback={<div className="page-loading">加载中…</div>}>
          <Outlet />
        </Suspense>
      </main>

      <DocumentReader onOpenNote={openNote} onAsk={askQuestion} />

      <button className="sidebar-toggle" type="button" aria-label="折叠侧边栏" onClick={() => setIsCollapsed((value) => !value)}>
        {isCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
      </button>
    </div>
  );
}

export default App;
