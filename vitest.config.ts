import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// 前端测试只跑纯逻辑（路由配置、store、工具函数），因此不加载 React/Tailwind 插件，
// 也不使用浏览器环境；需要渲染组件的测试以后再单独引入 happy-dom。
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    // 只收前端目录的测试，避免把 server/ 下的 node:test 用例当成 vitest 用例
    include: ["src/**/*.test.ts"],
  },
});
