import { useEffect, useState, type ComponentType, type FormEvent } from "react";
import {
  BarChart3,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  UserRound,
} from "lucide-react";
import {
  changePassword,
  deleteAccount,
  exportData,
  getSettings,
  getStats,
  listKnowledgeBases,
  saveSettings,
  updateDisplayName,
  type KnowledgeBaseDto,
  type ReplyStyle,
  type SettingsDto,
  type StatsDto,
} from "@/lib/api";
import { useAuthStore } from "@/lib/auth-store";

export function ProfilePage({
  isDark,
  onThemeChange,
}: {
  isDark: boolean;
  onThemeChange: (value: boolean) => void;
}) {
  const [activeSection, setActiveSection] = useState<
    "profile" | "ai" | "system" | "usage"
  >("profile");
  const sections = [
    { id: "profile" as const, label: "个人资料", icon: UserRound },
    { id: "ai" as const, label: "AI 设置", icon: SlidersHorizontal },
    { id: "system" as const, label: "系统设置", icon: Settings2 },
    { id: "usage" as const, label: "使用统计", icon: BarChart3 },
  ];

  return (
    <div className="profile-page">
      <div className="profile-page-head">
        <div>
          <p className="eyebrow">个人空间</p>
          <h2>个人中心</h2>
          <p>管理你的个人资料、AI 偏好和知识空间设置。</p>
        </div>
      </div>
      <div className="profile-workspace">
        <aside className="profile-nav">
          {sections.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              className={activeSection === id ? "selected" : ""}
              onClick={() => setActiveSection(id)}
            >
              <Icon size={17} />
              <span>{label}</span>
            </button>
          ))}
        </aside>
        <section className="profile-content">
          {activeSection === "profile" && <AccountSection />}
          {activeSection === "ai" && <AiSettings />}
          {activeSection === "system" && (
            <div className="settings-section">
              <SettingsHeading
                icon={Settings2}
                title="系统设置"
                description="自定义界面体验和个人数据管理方式。"
              />
              <div className="setting-row">
                <div>
                  <strong>界面主题</strong>
                  <p>选择适合当前环境的阅读主题。</p>
                </div>
                <div className="theme-choice">
                  <button
                    type="button"
                    className={!isDark ? "selected" : ""}
                    onClick={() => onThemeChange(false)}
                  >
                    浅色
                  </button>
                  <button
                    type="button"
                    className={isDark ? "selected" : ""}
                    onClick={() => onThemeChange(true)}
                  >
                    深色
                  </button>
                </div>
              </div>
              <div className="danger-zone">
                <div>
                  <span>
                    <ShieldCheck size={17} />
                  </span>
                  <div>
                    <strong>导出个人数据</strong>
                    <p>下载知识库（含文档分块文本）、笔记、对话和轨迹的 JSON 副本，不含原始文件。</p>
                  </div>
                </div>
                <ExportButton />
              </div>
            </div>
          )}
          {activeSection === "usage" && <UsageStats />}
        </section>
      </div>
    </div>
  );
}

function SettingsHeading({
  icon: Icon,
  title,
  description,
}: {
  icon: ComponentType<{ size?: number }>;
  title: string;
  description: string;
}) {
  return (
    <header className="settings-heading">
      <span>
        <Icon size={19} />
      </span>
      <div>
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
    </header>
  );
}
function SettingsInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="settings-input">
      <span>{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}
function SettingsSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="settings-input">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option}>{option}</option>
        ))}
      </select>
    </label>
  );
}
function Toggle({ checked, onChange }: { checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <button type="button" className={`toggle${checked ? " enabled" : ""}`} aria-pressed={checked} onClick={() => onChange(!checked)}>
      <span />
    </button>
  );
}
function UsageCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="usage-card">
      <p>{label}</p>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}

// 账号：用户名只读，可改显示名称和密码，可退出登录
function AccountSection() {
  const { user, setUser, signOut } = useAuthStore();
  const [displayName, setDisplayName] = useState(user?.displayName ?? "");
  const [passwords, setPasswords] = useState({ oldPassword: "", newPassword: "" });
  const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");

  const run = async (task: () => Promise<string>) => {
    setBusy(true);
    setMessage(null);
    try {
      setMessage({ text: await task(), isError: false });
    } catch (reason) {
      setMessage({ text: (reason as Error).message, isError: true });
    } finally {
      setBusy(false);
    }
  };

  const saveName = (event: FormEvent) => {
    event.preventDefault();
    void run(async () => {
      setUser(await updateDisplayName(displayName));
      return "显示名称已保存";
    });
  };

  const savePassword = (event: FormEvent) => {
    event.preventDefault();
    void run(async () => {
      await changePassword(passwords.oldPassword, passwords.newPassword);
      setPasswords({ oldPassword: "", newPassword: "" });
      return "密码已修改，其他设备上的登录已失效";
    });
  };

  const removeAccount = (event: FormEvent) => {
    event.preventDefault();
    if (!window.confirm("确定永久删除账号和全部数据吗？此操作无法恢复。")) return;
    void run(async () => {
      await deleteAccount(deletePassword);
      await signOut();
      return "账号已删除";
    });
  };

  return (
    <div className="settings-section">
      <SettingsHeading icon={UserRound} title="账号" description="管理你的登录信息与安全设置。" />
      <div className="account-grid">
        <div className="account-identity">
          <span className="profile-avatar-large">{(user?.displayName ?? "?").slice(0, 1).toUpperCase()}</span>
          <div>
            <strong>{user?.displayName}</strong>
            <p>@{user?.username}{user?.isAdmin ? " · 管理员" : ""}</p>
          </div>
          <button type="button" onClick={() => void signOut()}>退出登录</button>
        </div>
        <form className="account-panel" onSubmit={saveName}>
          <h4>显示名称</h4>
          <p>显示在侧栏和工作台的问候语中。</p>
          <SettingsInput label="名称" value={displayName} onChange={setDisplayName} />
          <div className="settings-footer">
            <span />
            <button type="submit" disabled={busy || !displayName.trim() || displayName.trim() === user?.displayName}>保存名称</button>
          </div>
        </form>
        <form className="account-panel" onSubmit={savePassword}>
          <h4>修改密码</h4>
          <p>修改后，其他设备上的登录会失效。</p>
          <label className="settings-input">
            <span>旧密码</span>
            <input type="password" autoComplete="current-password" value={passwords.oldPassword} onChange={(event) => setPasswords({ ...passwords, oldPassword: event.target.value })} />
          </label>
          <label className="settings-input">
            <span>新密码（8 到 128 位）</span>
            <input type="password" autoComplete="new-password" minLength={8} maxLength={128} value={passwords.newPassword} onChange={(event) => setPasswords({ ...passwords, newPassword: event.target.value })} />
          </label>
          <div className="settings-footer">
            <span />
            <button type="submit" disabled={busy || !passwords.oldPassword || passwords.newPassword.length < 8}>修改密码</button>
          </div>
        </form>
        <form className="account-panel" onSubmit={removeAccount}>
          <h4>删除账号</h4>
          <p>永久删除账号及全部知识库、文档、笔记、对话和向量，无法恢复。建议先导出个人数据。</p>
          <label className="settings-input">
            <span>输入密码确认</span>
            <input type="password" autoComplete="current-password" value={deletePassword} onChange={(event) => setDeletePassword(event.target.value)} />
          </label>
          <div className="settings-footer">
            <span />
            <button type="submit" disabled={busy || !deletePassword}>永久删除账号</button>
          </div>
        </form>
      </div>
      {message && <p className={message.isError ? "form-error" : "account-message"} role="status">{message.text}</p>}
    </div>
  );
}

const REPLY_STYLE_LABELS: Record<ReplyStyle, string> = { concise: "简洁", balanced: "平衡", detailed: "详细" };
const TOP_K_OPTIONS = [3, 5, 8, 10];

// AI 设置：改动后立即保存，保存失败时保留原值并提示
function AiSettings() {
  const [settings, setSettings] = useState<SettingsDto>();
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBaseDto[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([getSettings(), listKnowledgeBases()])
      .then(([loaded, bases]) => {
        setSettings(loaded);
        setKnowledgeBases(bases);
      })
      .catch((reason: Error) => setError(reason.message));
  }, []);

  const update = async (next: SettingsDto) => {
    setError("");
    try {
      setSettings(await saveSettings(next));
    } catch (reason) {
      setError((reason as Error).message);
    }
  };

  const toggleKnowledgeBase = (id: number, on: boolean) => {
    if (!settings) return;
    const ids = on ? [...settings.defaultKnowledgeBaseIds, id] : settings.defaultKnowledgeBaseIds.filter((item) => item !== id);
    void update({ ...settings, defaultKnowledgeBaseIds: ids });
  };

  return (
    <div className="settings-section">
      <SettingsHeading icon={Sparkles} title="AI 设置" description="调整 AI 在对话中回答你的方式，修改后立即生效。" />
      {error && <p className="form-error" role="status">{error}</p>}
      {settings && (
        <>
          <div className="setting-row">
            <div>
              <strong>回复风格</strong>
              <p>简洁：直接给结论和要点；详细：分点展开并举例。</p>
            </div>
            <div className="theme-choice">
              {(Object.keys(REPLY_STYLE_LABELS) as ReplyStyle[]).map((style) => (
                <button key={style} type="button" className={settings.replyStyle === style ? "selected" : ""} onClick={() => void update({ ...settings, replyStyle: style })}>
                  {REPLY_STYLE_LABELS[style]}
                </button>
              ))}
            </div>
          </div>
          <div className="setting-row">
            <div>
              <strong>严格模式</strong>
              <p>只依据知识库资料回答；资料不足时直接说明，不使用模型自身知识。</p>
            </div>
            <Toggle checked={settings.strictMode} onChange={(on) => void update({ ...settings, strictMode: on })} />
          </div>
          <SettingsSelect
            label="每次回答引用的资料条数"
            value={`${settings.topK} 条`}
            options={TOP_K_OPTIONS.map((count) => `${count} 条`)}
            onChange={(value) => void update({ ...settings, topK: Number.parseInt(value, 10) })}
          />
          <div className="setting-row">
            <div>
              <strong>新对话默认的知识库范围</strong>
              <p>都不选表示使用全部知识库。下次打开应用时生效。</p>
            </div>
          </div>
          {knowledgeBases.map((kb) => (
            <div className="setting-row" key={kb.id}>
              <div>
                <strong>{kb.name}</strong>
              </div>
              <Toggle checked={settings.defaultKnowledgeBaseIds.includes(kb.id)} onChange={(on) => toggleKnowledgeBase(kb.id, on)} />
            </div>
          ))}
        </>
      )}
    </div>
  );
}

// 使用统计：全部来自后端的真实数据
function UsageStats() {
  const [stats, setStats] = useState<StatsDto>();
  const [error, setError] = useState("");

  useEffect(() => {
    getStats()
      .then(setStats)
      .catch((reason: Error) => setError(reason.message));
  }, []);

  const percent = stats ? Math.min(100, Math.round((stats.tokens.today / stats.tokens.dailyLimit) * 100)) : 0;

  return (
    <div className="settings-section">
      <SettingsHeading icon={BarChart3} title="使用统计" description="了解你的知识积累和 AI 使用情况。" />
      {error && <p className="form-error" role="status">{error}</p>}
      {stats && (
        <>
          <div className="usage-grid">
            <UsageCard label="AI 对话" value={String(stats.conversations)} detail={`本月新增 ${stats.conversationsMonth} 个`} />
            <UsageCard label="文档" value={String(stats.documents)} detail={`已处理 ${stats.documentsDone} 份，失败 ${stats.documentsFailed} 份`} />
            <UsageCard label="笔记数量" value={String(stats.notes)} detail={`本月新增 ${stats.notesMonth} 篇`} />
            <UsageCard label="知识库" value={String(stats.knowledgeBases)} detail={`共 ${stats.chunks} 个片段`} />
          </div>
          <div className="usage-summary">
            <div>
              <p className="section-kicker">今日模型额度</p>
              <h3>
                已用 {stats.tokens.today.toLocaleString()} / {stats.tokens.dailyLimit.toLocaleString()} tokens
              </h3>
              <p>
                本月累计 {stats.tokens.month.toLocaleString()}，历史累计 {stats.tokens.total.toLocaleString()}。额度每天零点重置。
              </p>
            </div>
            <span>
              {percent}
              <small>%</small>
            </span>
          </div>
        </>
      )}
    </div>
  );
}

// 下载个人数据副本
function ExportButton() {
  const [state, setState] = useState<{ busy: boolean; error: string }>({ busy: false, error: "" });
  const download = async () => {
    setState({ busy: true, error: "" });
    try {
      const url = URL.createObjectURL(await exportData());
      const link = document.createElement("a");
      link.href = url;
      link.download = `personal-knowledge-export-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
      setState({ busy: false, error: "" });
    } catch (reason) {
      setState({ busy: false, error: (reason as Error).message });
    }
  };
  return (
    <>
      <button type="button" disabled={state.busy} onClick={() => void download()}>
        {state.busy ? "导出中…" : "导出"}
      </button>
      {state.error && <p className="form-error" role="status">{state.error}</p>}
    </>
  );
}
