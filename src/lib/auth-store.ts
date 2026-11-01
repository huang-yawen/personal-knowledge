import { create } from "zustand";
import { getMe, login, logout, register, setUnauthorizedHandler, type UserDto } from "@/lib/api";

type AuthState = {
  // loading：还在确认登录状态；anonymous：未登录
  status: "loading" | "anonymous" | "authenticated";
  user: UserDto | null;
  init: () => Promise<void>;
  signIn: (username: string, password: string) => Promise<void>;
  signUp: (input: { username: string; password: string; displayName?: string; inviteCode: string }) => Promise<void>;
  signOut: () => Promise<void>;
  setUser: (user: UserDto) => void;
};

export const useAuthStore = create<AuthState>()((set) => ({
  status: "loading",
  user: null,
  init: async () => {
    try {
      set({ status: "authenticated", user: await getMe() });
    } catch {
      set({ status: "anonymous", user: null });
    }
  },
  signIn: async (username, password) => set({ status: "authenticated", user: await login(username, password) }),
  signUp: async (input) => set({ status: "authenticated", user: await register(input) }),
  signOut: async () => {
    await logout().catch(console.error);
    // 刷新页面以清掉内存里属于上一个账号的全部数据（对话、笔记等）
    window.location.reload();
  },
  setUser: (user) => set({ user }),
}));

// 登录失效（如会话过期）时回到登录页；刷新后 getMe 会返回 401，自然显示登录页
setUnauthorizedHandler(() => window.location.reload());
