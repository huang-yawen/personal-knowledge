import { create } from "zustand";

const STORAGE_KEY = "theme";

// 默认跟随系统；用户在侧栏或个人中心切换后写入本地存储
const storedIsDark = () => {
  const saved = localStorage.getItem(STORAGE_KEY);
  return saved ? saved === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
};

type ThemeState = {
  isDark: boolean;
  setDark: (isDark: boolean) => void;
  toggle: () => void;
};

// 主题是全局外观，放在 store 里，侧栏和个人中心都能直接读写，不需要一层层传 props
export const useThemeStore = create<ThemeState>()((set, get) => ({
  isDark: storedIsDark(),
  setDark: (isDark) => {
    document.documentElement.classList.toggle("dark", isDark);
    localStorage.setItem(STORAGE_KEY, isDark ? "dark" : "light");
    set({ isDark });
  },
  toggle: () => get().setDark(!get().isDark),
}));

// 首次渲染前把已保存的偏好应用到 <html>，避免浅色主题闪一下再变深色
export const applyStoredTheme = () => {
  document.documentElement.classList.toggle("dark", useThemeStore.getState().isDark);
};
