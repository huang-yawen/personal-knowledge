import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// 前端测试分两类：
// - 纯逻辑（路由配置、store、工具函数）跑在 node 环境，不需要 DOM
// - 组件渲染在文件头用 `// @vitest-environment happy-dom` 单独切到浏览器环境
// 两种情况都不加载 React/Tailwind 插件，避免测试启动变慢。
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    // 只收前端目录的测试，避免把 server/ 下的 node:test 用例当成 vitest 用例
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
