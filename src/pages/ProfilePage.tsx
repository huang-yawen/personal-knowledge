import { useState, type ComponentType } from "react";
import { BarChart3, Settings2, ShieldCheck, SlidersHorizontal, Sparkles, UserRound } from "lucide-react";

export function ProfilePage({ isDark, onThemeChange }: { isDark: boolean; onThemeChange: (value: boolean) => void }) {
  const [activeSection, setActiveSection] = useState<"profile" | "ai" | "system" | "usage">("profile");
  const [profile, setProfile] = useState({ name: "Lenovo", bio: "持续学习，持续构建。", email: "lenovo@example.com" });
  const [model, setModel] = useState("DeepSeek Chat");
  const [replyStyle, setReplyStyle] = useState("平衡");
  const [defaultLibrary, setDefaultLibrary] = useState("全部知识库");
  const sections = [{ id: "profile" as const, label: "个人资料", icon: UserRound }, { id: "ai" as const, label: "AI 设置", icon: SlidersHorizontal }, { id: "system" as const, label: "系统设置", icon: Settings2 }, { id: "usage" as const, label: "使用统计", icon: BarChart3 }];

  return <div className="profile-page">
    <div className="profile-page-head"><div><p className="eyebrow">个人空间</p><h2>个人中心</h2><p>管理你的个人资料、AI 偏好和知识空间设置。</p></div></div>
    <div className="profile-workspace">
      <aside className="profile-nav">{sections.map(({ id, label, icon: Icon }) => <button key={id} type="button" className={activeSection === id ? "selected" : ""} onClick={() => setActiveSection(id)}><Icon size={17} /><span>{label}</span></button>)}</aside>
      <section className="profile-content">
        {activeSection === "profile" && <div className="settings-section"><SettingsHeading icon={UserRound} title="个人资料" description="这些信息会显示在你的个人知识空间中。" /><div className="profile-identity"><span className="profile-avatar-large">L</span><div><strong>{profile.name}</strong><p>个人知识空间</p></div><button type="button">更换头像</button></div><SettingsInput label="显示名称" value={profile.name} onChange={(value) => setProfile({ ...profile, name: value })} /><SettingsInput label="个人简介" value={profile.bio} onChange={(value) => setProfile({ ...profile, bio: value })} /><SettingsInput label="邮箱" value={profile.email} onChange={(value) => setProfile({ ...profile, email: value })} /><div className="settings-footer"><span>更改会自动保存</span><button type="button">保存资料</button></div></div>}
        {activeSection === "ai" && <div className="settings-section"><SettingsHeading icon={Sparkles} title="AI 设置" description="调整 AI 在对话和笔记中协助你的方式。" /><SettingsSelect label="默认模型" value={model} options={["DeepSeek Chat", "DeepSeek Reasoner"]} onChange={setModel} /><SettingsSelect label="回复风格" value={replyStyle} options={["简洁", "平衡", "详细"]} onChange={setReplyStyle} /><SettingsSelect label="默认知识库范围" value={defaultLibrary} options={["全部知识库", "机器学习", "产品与设计", "个人成长"]} onChange={setDefaultLibrary} /><div className="setting-row"><div><strong>在回答中展示引用来源</strong><p>当回答使用你的资料时，显示对应文档及原文片段。</p></div><Toggle initial /></div><div className="setting-row"><div><strong>允许 AI 使用笔记上下文</strong><p>在笔记中调用 AI 辅助时，会将当前内容作为上下文发送。</p></div><Toggle initial /></div></div>}
        {activeSection === "system" && <div className="settings-section"><SettingsHeading icon={Settings2} title="系统设置" description="自定义界面体验和个人数据管理方式。" /><div className="setting-row"><div><strong>界面主题</strong><p>选择适合当前环境的阅读主题。</p></div><div className="theme-choice"><button type="button" className={!isDark ? "selected" : ""} onClick={() => onThemeChange(false)}>浅色</button><button type="button" className={isDark ? "selected" : ""} onClick={() => onThemeChange(true)}>深色</button></div></div><div className="setting-row"><div><strong>跟随系统主题</strong><p>当系统的深浅主题切换时自动同步。</p></div><Toggle /></div><div className="danger-zone"><div><span><ShieldCheck size={17} /></span><div><strong>导出个人数据</strong><p>导出知识库、笔记、对话和学习记录的副本。</p></div></div><button type="button">请求导出</button></div></div>}
        {activeSection === "usage" && <div className="settings-section"><SettingsHeading icon={BarChart3} title="使用统计" description="了解你的知识积累和 AI 使用情况。" /><div className="usage-grid"><UsageCard label="AI 对话" value="128" detail="本月 34 次" /><UsageCard label="文档处理" value="286" detail="成功率 98.6%" /><UsageCard label="笔记数量" value="74" detail="本月新增 9 篇" /><UsageCard label="知识库" value="12" detail="总计 421 个片段" /></div><div className="usage-summary"><div><p className="section-kicker">本周活跃情况</p><h3>你已经连续学习 6 天</h3><p>继续保持节奏，让知识在使用中沉淀。</p></div><span>6<small>天</small></span></div></div>}
      </section>
    </div>
  </div>;
}

function SettingsHeading({ icon: Icon, title, description }: { icon: ComponentType<{ size?: number }>; title: string; description: string }) { return <header className="settings-heading"><span><Icon size={19} /></span><div><h3>{title}</h3><p>{description}</p></div></header>; }
function SettingsInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <label className="settings-input"><span>{label}</span><input value={value} onChange={(event) => onChange(event.target.value)} /></label>; }
function SettingsSelect({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) { return <label className="settings-input"><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option key={option}>{option}</option>)}</select></label>; }
function Toggle({ initial = false }: { initial?: boolean }) { const [enabled, setEnabled] = useState(initial); return <button type="button" className={`toggle${enabled ? " enabled" : ""}`} aria-pressed={enabled} onClick={() => setEnabled((value) => !value)}><span /></button>; }
function UsageCard({ label, value, detail }: { label: string; value: string; detail: string }) { return <div className="usage-card"><p>{label}</p><strong>{value}</strong><small>{detail}</small></div>; }
