import { useState, type FormEvent, type MouseEvent } from "react";
import { ArrowRight, BookOpen, Eye, EyeOff, Link2, ShieldCheck } from "lucide-react";
import { useAuthStore } from "@/lib/auth-store";

// 品牌标记：圆环 + 四角星
function LogoMark() {
  return (
    <svg viewBox="0 0 32 32" width="30" height="30" aria-hidden="true">
      <circle cx="16" cy="16" r="15" fill="none" stroke="currentColor" strokeOpacity=".35" />
      <path d="M16 6l2.2 7.8L26 16l-7.8 2.2L16 26l-2.2-7.8L6 16l7.8-2.2z" fill="currentColor" />
    </svg>
  );
}

// 登录 / 注册页。注册必须持有邀请码（由管理员在服务器上生成）
export function AuthPage() {
  const { signIn, signUp } = useAuthStore();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [form, setForm] = useState({ username: "", password: "", displayName: "", inviteCode: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const isRegister = mode === "register";

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (isRegister) {
        await signUp({
          username: form.username.trim(),
          password: form.password,
          displayName: form.displayName.trim() || undefined,
          inviteCode: form.inviteCode.trim(),
        });
      } else {
        await signIn(form.username.trim(), form.password);
      }
    } catch (reason) {
      setError((reason as Error).message);
      setBusy(false);
    }
  };

  const field = (key: keyof typeof form) => ({
    value: form[key],
    onChange: (event: { target: { value: string } }) => setForm({ ...form, [key]: event.target.value }),
  });

  const switchMode = (next: "login" | "register") => {
    setMode(next);
    setError("");
  };

  // 品牌面板上的柔和聚光跟随鼠标
  const moveSpotlight = (event: MouseEvent<HTMLElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty("--mx", `${event.clientX - rect.left}px`);
    event.currentTarget.style.setProperty("--my", `${event.clientY - rect.top}px`);
  };

  return (
    <main className="auth-shell">
      <section className="auth-brand" onMouseMove={moveSpotlight}>
        <div className="auth-brand-bg" aria-hidden="true">
          <i className="auth-orb auth-orb-a" />
          <i className="auth-orb auth-orb-b" />
          <i className="auth-orb auth-orb-c" />
          <span className="auth-grid" />
          <span className="auth-grain" />
        </div>
        <header className="auth-logo">
          <LogoMark />
          <span>Personal Knowledge</span>
        </header>
        <div className="auth-hero">
          <p className="auth-kicker">Personal knowledge workspace</p>
          <h2>
            让每一次阅读，
            <br />
            成为可检索的<em>长期记忆</em>。
          </h2>
          <p className="auth-lead">导入资料，建立知识库，基于你自己的资料提问，再把答案沉淀成笔记。</p>
        </div>
        <ul className="auth-points">
          <li><Link2 size={15} /> 每个回答都能溯源到原文</li>
          <li><BookOpen size={15} /> 笔记与知识库互通</li>
          <li><ShieldCheck size={15} /> 数据只属于你</li>
        </ul>
      </section>

      <section className="auth-panel">
        <form className="auth-card" onSubmit={(event) => void submit(event)}>
          <div className="auth-tabs" role="tablist" aria-label="登录或注册">
            <span className="auth-tab-thumb" data-mode={mode} aria-hidden="true" />
            <button type="button" role="tab" aria-selected={!isRegister} onClick={() => switchMode("login")}>登录</button>
            <button type="button" role="tab" aria-selected={isRegister} onClick={() => switchMode("register")}>注册</button>
          </div>
          <h1>{isRegister ? "创建你的账号" : "欢迎回来"}</h1>
          <p className="auth-sub">{isRegister ? "使用邀请码，开始构建你的知识空间。" : "登录后继续你的阅读与思考。"}</p>

          <label>
            <span>用户名</span>
            <input {...field("username")} autoComplete="username" required minLength={3} maxLength={32} autoFocus />
          </label>
          {isRegister && (
            <label>
              <span>显示名称 <small>可选</small></span>
              <input {...field("displayName")} maxLength={50} />
            </label>
          )}
          <label>
            <span>密码</span>
            <div className="auth-password">
              <input
                {...field("password")}
                type={showPassword ? "text" : "password"}
                autoComplete={isRegister ? "new-password" : "current-password"}
                required
                minLength={8}
                maxLength={128}
              />
              <button type="button" aria-label={showPassword ? "隐藏密码" : "显示密码"} onClick={() => setShowPassword((value) => !value)}>
                {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
          </label>
          {isRegister && (
            <label>
              <span>邀请码</span>
              <input {...field("inviteCode")} className="auth-code" autoComplete="off" required />
            </label>
          )}
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="auth-submit" type="submit" disabled={busy}>
            <span>{busy ? "请稍候…" : isRegister ? "注册并登录" : "登录"}</span>
            {!busy && <ArrowRight size={17} />}
          </button>
          <p className="auth-foot">{isRegister ? "注册需要邀请码，请向管理员获取。" : "忘记密码请联系管理员重置。"}</p>
        </form>
      </section>
    </main>
  );
}
