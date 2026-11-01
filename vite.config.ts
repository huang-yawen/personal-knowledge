import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // 开发时把 /api 转发给本地后端。changeOrigin 必须为 false：后端会校验写请求的 Origin 与 Host 一致，
    // 若代理把 Host 改成后端地址，登录、注册等 POST 请求会被当成跨站请求拒绝
    proxy: { '/api': { target: 'http://127.0.0.1:3001', changeOrigin: false } },
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})