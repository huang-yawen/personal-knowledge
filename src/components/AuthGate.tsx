import { useEffect, type ReactNode } from "react";
import { AuthPage } from "@/pages/AuthPage";
import { useAuthStore } from "@/lib/auth-store";

// 登录状态确认后才渲染应用；未登录显示登录页
export function AuthGate({ children }: { children: ReactNode }) {
  const status = useAuthStore((state) => state.status);
  const init = useAuthStore((state) => state.init);
  useEffect(() => {
    void init();
  }, [init]);

  if (status === "loading") return <div className="auth-loading">加载中…</div>;
  if (status === "anonymous") return <AuthPage />;
  return <>{children}</>;
}
