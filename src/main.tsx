import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import { AppRoutes } from './AppRoutes.tsx'
import { ErrorBoundary } from './components/ErrorBoundary.tsx'
import { AuthGate } from './components/AuthGate.tsx'
import { applyStoredTheme } from './lib/theme-store.ts'

// 渲染前先把已保存的主题应用到 <html>，避免深色模式下先闪一帧浅色
applyStoredTheme()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      {/* AuthGate 在路由外层：登录后路由直接按当前地址挂载，刷新和深链接都能落到原页面 */}
      <AuthGate>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </AuthGate>
    </ErrorBoundary>
  </StrictMode>,
)
