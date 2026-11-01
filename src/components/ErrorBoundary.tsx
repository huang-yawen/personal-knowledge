import { Component, type ErrorInfo, type ReactNode } from "react";

// 全局错误边界：某个组件渲染出错时显示提示，而不是整页白屏
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("页面渲染出错", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="error-boundary" role="alert">
        <h2>页面出错了</h2>
        <p>{this.state.error.message}</p>
        <button type="button" onClick={() => window.location.reload()}>刷新页面</button>
      </div>
    );
  }
}
