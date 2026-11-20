import { useEffect, useRef, type ReactNode } from "react";
import { Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";
import App from "@/App";
import { lazyPage } from "@/lib/pages";
import { useAuthStore } from "@/lib/auth-store";

// 懒加载的页面组件：模块作用域各创建一次
const Dashboard = lazyPage("dashboard");
const ChatPage = lazyPage("chat");
const KnowledgePage = lazyPage("knowledge");
const NotesPage = lazyPage("notes");
const ProfilePage = lazyPage("profile");
const AdminPage = lazyPage("admin");

// 应用壳里的两种页面容器：
// ScrollPage 用于普通页面，内容在容器内滚动；BleedPage 用于对话、知识库、笔记这类自己铺满视口的页面
function ScrollPage() {
  const { pathname } = useLocation();
  const ref = useRef<HTMLDivElement>(null);
  // 切换页面时回到顶部，否则会继承上一个页面的滚动位置
  useEffect(() => {
    ref.current?.scrollTo({ top: 0 });
  }, [pathname]);
  return (
    <div className="page-scroll" ref={ref}>
      <Outlet />
    </div>
  );
}

function BleedPage() {
  return (
    <div className="page-bleed">
      <Outlet />
    </div>
  );
}

// 管理页只对管理员开放；非管理员直接回工作台（服务端接口另有校验）
function RequireAdmin({ children }: { children: ReactNode }) {
  const isAdmin = useAuthStore((state) => state.user?.isAdmin ?? false);
  return isAdmin ? <>{children}</> : <Navigate to="/" replace />;
}

// 路由表：App 是带侧栏的应用壳布局，页面在它的 Outlet 里渲染
export function AppRoutes() {
  return (
    <Routes>
      <Route element={<App />}>
        <Route element={<ScrollPage />}>
          <Route index element={<Dashboard />} />
          <Route path="profile" element={<ProfilePage />} />
          <Route
            path="admin"
            element={
              <RequireAdmin>
                <AdminPage />
              </RequireAdmin>
            }
          />
        </Route>
        <Route element={<BleedPage />}>
          <Route path="chat" element={<ChatPage />} />
          <Route path="knowledge" element={<KnowledgePage />} />
          <Route path="notes" element={<NotesPage />} />
        </Route>
        {/* 未知路径回工作台，不留下无效地址 */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
