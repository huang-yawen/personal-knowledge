import { useState, type FormEvent } from "react";
import { useAuthStore } from "@/lib/auth-store";

// 登录 / 注册页。注册必须持有邀请码（由管理员在服务器上生成）
export function AuthPage() {
  const { signIn, signUp } = useAuthStore();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [form, setForm] = useState({ username: "", password: "", displayName: "", inviteCode: "" });
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

  return (
    <main className="auth-page">
      <form className="auth-card" onSubmit={(event) => void submit(event)}>
        <h1>Personal Knowledge</h1>
        <p>{isRegister ? "使用邀请码创建账号" : "登录你的个人知识空间"}</p>
        <label>
          <span>用户名</span>
          <input {...field("username")} autoComplete="username" required minLength={3} maxLength={32} autoFocus />
        </label>
        {isRegister && (
          <label>
            <span>显示名称（可选）</span>
            <input {...field("displayName")} maxLength={50} />
          </label>
        )}
        <label>
          <span>密码</span>
          <input {...field("password")} type="password" autoComplete={isRegister ? "new-password" : "current-password"} required minLength={8} maxLength={128} />
        </label>
        {isRegister && (
          <label>
            <span>邀请码</span>
            <input {...field("inviteCode")} autoComplete="off" required />
          </label>
        )}
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="auth-submit" type="submit" disabled={busy}>
          {busy ? "请稍候…" : isRegister ? "注册并登录" : "登录"}
        </button>
        <button className="auth-switch" type="button" onClick={() => { setMode(isRegister ? "login" : "register"); setError(""); }}>
          {isRegister ? "已有账号？去登录" : "有邀请码？去注册"}
        </button>
      </form>
    </main>
  );
}
