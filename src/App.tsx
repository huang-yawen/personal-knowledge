import { useEffect, useState, type ComponentType } from "react";
import {
  Archive,
  ArrowUpRight,
  BarChart3,
  Bell,
  Bold,
  BookOpen,
  Bot,
  ChevronLeft,
  ChevronRight,
  Clock3,
  CheckCircle2,
  Check,
  CircleAlert,
  Code2,
  FileText,
  FilePlus2,
  FileUp,
  FolderPlus,
  GraduationCap,
  Grid2X2,
  LibraryBig,
  List,
  Menu,
  MessageSquareText,
  Moon,
  MoreHorizontal,
  Plus,
  PencilLine,
  Search,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Tag,
  Sun,
  Upload,
  UserRound,
  WandSparkles,
  X,
} from "lucide-react";
import "./App.css";
import { Thread } from "@/components/assistant-ui/elements/thread.aui";
import { MyRuntimeProvider } from "./MyRuntimeProvider";

type NavItem = {
  label: string;
  icon: ComponentType<{ size?: number; strokeWidth?: number }>;
};

type KnowledgeDocument = {
  name: string;
  type: string;
  size: string;
  updated: string;
  status: "完成" | "处理中" | "等待处理" | "处理失败";
};

type KnowledgeBase = {
  id: number;
  name: string;
  description: string;
  documents: number;
  updated: string;
  cover: "blue" | "purple" | "orange" | "green";
  items: KnowledgeDocument[];
};

type Note = {
  id: number;
  title: string;
  content: string;
  category: string;
  tags: string[];
  updated: string;
};

const initialKnowledgeBases: KnowledgeBase[] = [
  { id: 1, name: "机器学习", description: "深度学习、模型训练与工程实践", documents: 37, updated: "今天更新", cover: "blue", items: [{ name: "Deep Learning Notes.pdf", type: "PDF", size: "8.4 MB", updated: "今天", status: "完成" }, { name: "Transformer Architecture.md", type: "MD", size: "42 KB", updated: "昨天", status: "完成" }, { name: "attention-is-all-you-need.pdf", type: "PDF", size: "2.1 MB", updated: "10 月 28 日", status: "处理中" }] },
  { id: 2, name: "产品与设计", description: "产品思考、交互设计与用户研究", documents: 24, updated: "昨天更新", cover: "purple", items: [{ name: "Design systems handbook.md", type: "MD", size: "36 KB", updated: "昨天", status: "完成" }, { name: "用户访谈记录.txt", type: "TXT", size: "18 KB", updated: "10 月 26 日", status: "完成" }] },
  { id: 3, name: "个人成长", description: "阅读、思考与长期学习笔记", documents: 18, updated: "3 天前更新", cover: "orange", items: [{ name: "年度阅读清单.md", type: "MD", size: "12 KB", updated: "10 月 21 日", status: "完成" }] },
  { id: 4, name: "软件工程", description: "架构、代码与项目复盘资料", documents: 42, updated: "上周更新", cover: "green", items: [{ name: "Clean Architecture.pdf", type: "PDF", size: "5.7 MB", updated: "10 月 18 日", status: "完成" }] },
];

const initialNotes: Note[] = [
  { id: 1, title: "RAG 检索优化", category: "机器学习", tags: ["RAG", "检索"], updated: "12 分钟前", content: "# RAG 检索优化\n\n检索增强生成的效果，通常取决于 **数据质量、切块策略和检索排序** 三个层面。\n\n## 核心思路\n\n- 使用语义完整的文本分段，而不是固定长度截断\n- 在向量检索前加入元数据过滤\n- 对初步召回的内容使用 rerank 重排序\n\n> 回答必须可以回溯到真实的原始资料。\n\n## 下一步\n\n补充不同 chunk size 对召回效果的实验记录。" },
  { id: 2, title: "Transformer 注意力机制", category: "机器学习", tags: ["Transformer", "模型"], updated: "昨天", content: "# Transformer 注意力机制\n\n注意力机制让模型能够动态计算序列元素之间的相关性。" },
  { id: 3, title: "个人知识系统的设计原则", category: "个人成长", tags: ["知识管理"], updated: "10 月 27 日", content: "# 个人知识系统的设计原则\n\n知识需要被持续使用，才能真正沉淀。" },
  { id: 4, title: "设计系统组件清单", category: "产品与设计", tags: ["设计系统", "UI"], updated: "10 月 24 日", content: "# 设计系统组件清单\n\n建立一致且可扩展的组件基础。" },
];

const navItems: NavItem[] = [
  { label: "工作台", icon: Grid2X2 },
  { label: "AI 对话", icon: MessageSquareText },
  { label: "我的知识库", icon: LibraryBig },
  { label: "我的笔记", icon: FileText },
  { label: "个人中心", icon: UserRound },
];

const metrics = [
  { label: "知识库", value: "12", detail: "较上月 +2", icon: LibraryBig, color: "blue" },
  { label: "文档", value: "286", detail: "本周新增 14", icon: Archive, color: "orange" },
  { label: "笔记", value: "74", detail: "本周编辑 9", icon: FileText, color: "purple" },
  { label: "待复习", value: "18", detail: "今天待完成", icon: GraduationCap, color: "green" },
];

const activities = [
  { icon: FileText, color: "purple", title: "编辑了笔记", detail: "RAG 检索优化 · 12 分钟前" },
  { icon: Upload, color: "blue", title: "导入了文档", detail: "Deep Learning Notes.pdf · 2 小时前" },
  { icon: MessageSquareText, color: "orange", title: "完成了一次知识问答", detail: "关于 Transformer 的注意力机制 · 昨天" },
];

function App() {
  const [isDark, setIsDark] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [activeNav, setActiveNav] = useState("工作台");

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
  }, [isDark]);

  const currentTitle = activeNav;

  return (
    <div className={`app-shell${isCollapsed ? " sidebar-collapsed" : ""}`}>
      <button
        className="mobile-menu-button"
        type="button"
        aria-label="打开导航菜单"
        onClick={() => setIsSidebarOpen(true)}
      >
        <Menu size={20} />
      </button>

      <aside className={`sidebar${isSidebarOpen ? " is-open" : ""}`} aria-label="主导航">
        <div className="sidebar-header">
          <div className="brand">
            <div className="brand-mark" aria-hidden="true"><Sparkles size={17} /></div>
            <span>Personal Knowledge</span>
          </div>
          <button className="sidebar-close" type="button" aria-label="关闭导航菜单" onClick={() => setIsSidebarOpen(false)}>
            <X size={19} />
          </button>
        </div>

        <nav className="nav-list">
          {navItems.map(({ label, icon: Icon }) => (
            <button
              className={`nav-item${activeNav === label ? " active" : ""}`}
              type="button"
              key={label}
              onClick={() => { setActiveNav(label); setIsSidebarOpen(false); }}
            >
              <Icon size={19} strokeWidth={1.8} />
              <span>{label}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <button className="nav-item" type="button" onClick={() => setActiveNav("个人中心")}>
            <Settings2 size={19} strokeWidth={1.8} />
            <span>设置</span>
          </button>
          <button className="profile-button" type="button">
            <span className="avatar">L</span>
            <span className="profile-copy"><strong>Lenovo</strong><small>个人空间</small></span>
            <MoreHorizontal size={18} />
          </button>
        </div>
      </aside>

      {isSidebarOpen && <button className="sidebar-scrim" type="button" aria-label="关闭导航菜单" onClick={() => setIsSidebarOpen(false)} />}

      <main className="main-content">
        <header className="topbar">
          <div className="page-identity">
            <p className="eyebrow">个人知识空间</p>
            <h1>{currentTitle}</h1>
          </div>
          <div className="topbar-actions">
            <button className="icon-button search-button" type="button" aria-label="搜索"><Search size={19} /><span>搜索</span><kbd>⌘ K</kbd></button>
            <button className="icon-button" type="button" aria-label="通知"><Bell size={19} /></button>
            <button className="icon-button" type="button" aria-label={isDark ? "切换至浅色模式" : "切换至深色模式"} onClick={() => setIsDark((value) => !value)}>
              {isDark ? <Sun size={19} /> : <Moon size={19} />}
            </button>
            <button className="create-button" type="button"><Plus size={18} /> <span>新建</span></button>
          </div>
        </header>

        {activeNav === "工作台" ? <Dashboard /> : activeNav === "AI 对话" ? <ChatPage /> : activeNav === "我的知识库" ? <KnowledgePage /> : activeNav === "我的笔记" ? <NotesPage /> : activeNav === "个人中心" ? <ProfilePage isDark={isDark} onThemeChange={setIsDark} /> : <PlaceholderPage page={activeNav} />}
      </main>

      <button className="sidebar-toggle" type="button" aria-label="折叠侧边栏" onClick={() => setIsCollapsed((value) => !value)}>
        {isCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
      </button>
    </div>
  );
}

function Dashboard() {
  return (
    <div className="dashboard">
      <section className="welcome-section">
        <div>
          <p className="greeting">早上好，Lenovo</p>
          <p className="welcome-copy">让每一次阅读，成为可检索的长期记忆。</p>
        </div>
        <button className="subtle-button" type="button"><Clock3 size={17} /> 查看学习记录</button>
      </section>

      <section className="metric-grid" aria-label="知识概览">
        {metrics.map(({ label, value, detail, icon: Icon, color }) => (
          <article className="metric-card" key={label}>
            <div className={`metric-icon ${color}`}><Icon size={19} strokeWidth={1.8} /></div>
            <div className="metric-main"><span>{label}</span><strong>{value}</strong></div>
            <p>{detail}</p>
          </article>
        ))}
      </section>

      <section className="content-grid primary-grid">
        <article className="panel continue-panel">
          <div className="panel-heading"><div><p className="section-kicker">继续进行</p><h2>回到你的工作流</h2></div><button className="text-button" type="button">查看全部 <ArrowUpRight size={15} /></button></div>
          <div className="continue-list">
            <button className="continue-item" type="button"><span className="document-icon purple"><FileText size={18} /></span><span className="continue-copy"><strong>RAG 检索优化</strong><small>我的笔记 · 12 分钟前编辑</small></span><ChevronRight size={18} /></button>
            <button className="continue-item" type="button"><span className="document-icon blue"><MessageSquareText size={18} /></span><span className="continue-copy"><strong>Transformer 的注意力机制</strong><small>AI 对话 · 昨天</small></span><ChevronRight size={18} /></button>
            <button className="continue-item" type="button"><span className="document-icon orange"><BookOpen size={18} /></span><span className="continue-copy"><strong>Deep Learning Notes</strong><small>机器学习 · 37 个文档</small></span><ChevronRight size={18} /></button>
          </div>
        </article>

        <article className="panel quick-panel">
          <div className="panel-heading"><div><p className="section-kicker">快捷开始</p><h2>创造新的连接</h2></div></div>
          <div className="quick-grid">
            <button className="quick-action" type="button"><span className="quick-icon"><Upload size={19} /></span><span>上传资料</span></button>
            <button className="quick-action" type="button"><span className="quick-icon"><FileText size={19} /></span><span>新建笔记</span></button>
            <button className="quick-action" type="button"><span className="quick-icon"><Bot size={19} /></span><span>开始对话</span></button>
            <button className="quick-action" type="button"><span className="quick-icon"><FolderPlus size={19} /></span><span>创建知识库</span></button>
          </div>
        </article>
      </section>

      <section className="content-grid secondary-grid">
        <article className="panel activity-panel">
          <div className="panel-heading"><div><p className="section-kicker">学习动态</p><h2>本周保持了节奏</h2></div><span className="trend">+24% <small>较上周</small></span></div>
          <div className="chart" aria-label="过去七天学习活动图表">
            {[38, 54, 32, 72, 58, 91, 66].map((height, index) => <span key={height} className={index === 5 ? "active-bar" : ""} style={{ height: `${height}%` }} />)}
          </div>
          <div className="chart-labels"><span>周一</span><span>周二</span><span>周三</span><span>周四</span><span>周五</span><span>周六</span><span>今天</span></div>
          <div className="activity-list">
            {activities.map(({ icon: Icon, color, title, detail }) => <div className="activity-item" key={title}><span className={`activity-icon ${color}`}><Icon size={15} /></span><p><strong>{title}</strong><small>{detail}</small></p></div>)}
          </div>
        </article>

        <article className="panel review-panel">
          <div className="panel-heading"><div><p className="section-kicker">今日复习</p><h2>18 张卡片等待你</h2></div><span className="review-count">18</span></div>
          <p className="review-copy">完成今天的复习，继续巩固正在构建的知识网络。</p>
          <div className="review-progress"><span style={{ width: "38%" }} /></div>
          <div className="review-meta"><span>已完成 7 张</span><span>预计 8 分钟</span></div>
          <button className="review-button" type="button">开始复习 <ArrowUpRight size={17} /></button>
        </article>
      </section>
    </div>
  );
}

function PlaceholderPage({ page }: { page: string }) {
  return <div className="placeholder-page"><span className="placeholder-icon"><Sparkles size={25} /></span><p className="section-kicker">正在构建</p><h2>{page}</h2><p>该模块将按照既定设计规范在下一阶段接入。</p></div>;
}

function ProfilePage({ isDark, onThemeChange }: { isDark: boolean; onThemeChange: (value: boolean) => void }) {
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

function NotesPage() {
  const [notes, setNotes] = useState(initialNotes);
  const [selectedId, setSelectedId] = useState(1);
  const [query, setQuery] = useState("");
  const [isPreview, setIsPreview] = useState(false);
  const [aiDraft, setAiDraft] = useState<string | null>(null);
  const selectedNote = notes.find((note) => note.id === selectedId) ?? notes[0];
  const visibleNotes = notes.filter((note) => `${note.title} ${note.category} ${note.tags.join(" ")}`.toLowerCase().includes(query.toLowerCase()));

  const updateNote = (content: string) => setNotes((items) => items.map((note) => note.id === selectedNote.id ? { ...note, content, updated: "刚刚" } : note));
  const newNote = () => {
    const id = Math.max(...notes.map((note) => note.id), 0) + 1;
    const note: Note = { id, title: "未命名笔记", content: "# 未命名笔记\n\n开始记录你的想法…", category: "未分类", tags: [], updated: "刚刚" };
    setNotes((items) => [note, ...items]);
    setSelectedId(id);
    setIsPreview(false);
    setAiDraft(null);
  };
  const createAiDraft = () => setAiDraft(`# ${selectedNote.title}\n\n## 核心摘要\n\n${selectedNote.content.replace(/^#.*\n?/, "").split("\n").filter(Boolean).slice(0, 3).join(" ")}\n\n## 建议的后续行动\n\n- 补充可验证的资料来源\n- 把关键概念转化为复习卡片\n- 在下一次复习时更新理解\n`);

  return (
    <div className="notes-page">
      <div className="notes-page-head"><div><p className="eyebrow">知识沉淀</p><h2>我的笔记</h2></div><button className="knowledge-create" type="button" onClick={newNote}><FilePlus2 size={17} /> 新建笔记</button></div>
      <div className="notes-workspace">
        <aside className="notes-list-panel">
          <div className="notes-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索笔记" /></div>
          <div className="notes-filter-row"><span>全部笔记 <b>{notes.length}</b></span><button type="button"><Tag size={14} /> 标签</button></div>
          <div className="notes-list">{visibleNotes.map((note) => <button type="button" key={note.id} onClick={() => { setSelectedId(note.id); setAiDraft(null); }} className={`note-list-item${note.id === selectedNote.id ? " selected" : ""}`}><strong>{note.title}</strong><p>{note.content.replace(/^#.*\n?/, "").replace(/[#*>-]/g, "").trim().slice(0, 52)}</p><small><span>{note.category}</span> · {note.updated}</small></button>)}</div>
          {visibleNotes.length === 0 && <div className="notes-no-result">没有找到匹配的笔记</div>}
        </aside>

        <section className="note-editor-section">
          <header className="note-editor-header"><div><input className="note-title-input" value={selectedNote.title} aria-label="笔记标题" onChange={(event) => setNotes((items) => items.map((note) => note.id === selectedNote.id ? { ...note, title: event.target.value, updated: "刚刚" } : note))} /><p><span>{selectedNote.category}</span> · 已保存 · {selectedNote.updated}</p></div><div className="editor-actions"><button type="button" className={!isPreview ? "is-active" : ""} onClick={() => setIsPreview(false)}><PencilLine size={15} /> 编辑</button><button type="button" className={isPreview ? "is-active" : ""} onClick={() => setIsPreview(true)}><EyeIcon /> 预览</button><button type="button" aria-label="更多笔记操作"><MoreHorizontal size={18} /></button></div></header>
          <div className="editor-toolbar"><button type="button" title="粗体"><Bold size={16} /></button><button type="button" title="列表"><List size={16} /></button><button type="button" title="代码"><Code2 size={16} /></button><span /><button type="button" title="插入标签"><Tag size={16} /></button></div>
          {isPreview ? <article className="markdown-preview"><MarkdownPreview content={selectedNote.content} /></article> : <textarea className="note-editor" value={selectedNote.content} onChange={(event) => updateNote(event.target.value)} spellCheck />}
        </section>

        <aside className="note-ai-panel"><div className="note-ai-heading"><span><WandSparkles size={16} /></span><div><strong>AI 笔记辅助</strong><p>基于当前笔记生成候选内容</p></div></div><div className="ai-actions"><button type="button" onClick={createAiDraft}>总结笔记</button><button type="button" onClick={createAiDraft}>提取知识点</button><button type="button" onClick={createAiDraft}>优化表达</button><button type="button" onClick={createAiDraft}>生成复习卡片</button></div>{aiDraft ? <div className="ai-draft"><p className="section-kicker">AI 生成草稿</p><div className="ai-draft-content"><MarkdownPreview content={aiDraft} /></div><div className="ai-draft-actions"><button type="button" onClick={() => setAiDraft(null)}>保留原文</button><button type="button" className="accept-draft" onClick={() => { updateNote(aiDraft); setAiDraft(null); }}>应用草稿 <Check size={14} /></button></div></div> : <div className="ai-guidance"><Sparkles size={17} /><p>AI 的修改始终以草稿形式展示，需要你确认后才会覆盖笔记内容。</p></div>}</aside>
      </div>
    </div>
  );
}

function EyeIcon() { return <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" /><circle cx="12" cy="12" r="2.5" /></svg>; }

function MarkdownPreview({ content }: { content: string }) {
  return <>
    {content.split("\n").map((line, index) =>
      line.startsWith("# ") ? <h1 key={`${line}-${index}`}>{line.slice(2)}</h1>
        : line.startsWith("## ") ? <h2 key={`${line}-${index}`}>{line.slice(3)}</h2>
          : line.startsWith("- ") ? <li key={`${line}-${index}`}>{line.slice(2)}</li>
            : line.startsWith("> ") ? <blockquote key={`${line}-${index}`}>{line.slice(2)}</blockquote>
              : line ? <p key={`${line}-${index}`}>{line.replaceAll("**", "")}</p>
                : <br key={`empty-${index}`} />,
    )}
  </>;
}

function KnowledgePage() {
  const [knowledgeBases, setKnowledgeBases] = useState(initialKnowledgeBases);
  const [selectedId, setSelectedId] = useState(1);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const selectedBase = knowledgeBases.find((item) => item.id === selectedId) ?? knowledgeBases[0];

  const createKnowledgeBase = () => {
    const name = newName.trim();
    if (!name) return;
    const id = Math.max(...knowledgeBases.map((item) => item.id), 0) + 1;
    const next: KnowledgeBase = { id, name, description: newDescription.trim() || "尚未添加描述", documents: 0, updated: "刚刚创建", cover: "blue", items: [] };
    setKnowledgeBases((items) => [next, ...items]);
    setSelectedId(id);
    setNewName("");
    setNewDescription("");
    setIsCreateOpen(false);
  };

  const addDocument = (file: File) => {
    const fileType = file.name.split(".").pop()?.toUpperCase() ?? "文件";
    const newDocument: KnowledgeDocument = { name: file.name, type: fileType, size: `${Math.max(file.size / 1024 / 1024, 0.1).toFixed(1)} MB`, updated: "刚刚上传", status: "等待处理" };
    const updateStatus = (status: KnowledgeDocument["status"]) => setKnowledgeBases((items) => items.map((base) => base.id !== selectedBase.id ? base : { ...base, updated: "刚刚更新", items: base.items.map((document) => document.name === file.name ? { ...document, status } : document) }));
    setKnowledgeBases((items) => items.map((base) => base.id !== selectedBase.id ? base : { ...base, updated: "刚刚更新", documents: base.documents + 1, items: [newDocument, ...base.items] }));
    window.setTimeout(() => updateStatus("处理中"), 700);
    window.setTimeout(() => updateStatus("完成"), 2300);
  };

  return (
    <div className="knowledge-page">
      <div className="knowledge-page-head">
        <div><p className="eyebrow">个人资料空间</p><h2>我的知识库</h2><p>将资料沉淀为可检索、可连接的长期知识资产。</p></div>
        <button className="knowledge-create" type="button" onClick={() => setIsCreateOpen(true)}><Plus size={17} /> 创建知识库</button>
      </div>
      <div className="knowledge-layout">
        <section className="knowledge-list-section">
          <div className="knowledge-list-tools"><div className="knowledge-search"><Search size={16} /><span>搜索知识库</span></div><button type="button" aria-label="筛选知识库"><Settings2 size={16} /></button></div>
          <div className="knowledge-card-list">
            {knowledgeBases.map((base) => <button key={base.id} type="button" className={`knowledge-card${base.id === selectedBase.id ? " selected" : ""}`} onClick={() => setSelectedId(base.id)}><span className={`knowledge-cover ${base.cover}`}><LibraryBig size={20} /></span><span className="knowledge-card-copy"><strong>{base.name}</strong><small>{base.documents} 份资料 · {base.updated}</small></span><ChevronRight size={17} /></button>)}
          </div>
        </section>

        <section className="knowledge-detail-section">
          <header className="knowledge-detail-head"><div className="knowledge-detail-title"><span className={`knowledge-cover large ${selectedBase.cover}`}><LibraryBig size={23} /></span><div><h3>{selectedBase.name}</h3><p>{selectedBase.description}</p></div></div><button type="button" className="detail-more" aria-label="知识库更多选项"><MoreHorizontal size={19} /></button></header>
          <div className="document-toolbar"><div><strong>资料</strong><span>{selectedBase.documents} 个文档</span></div><label className="upload-button"><FileUp size={16} /> 上传资料<input type="file" accept=".pdf,.txt,.md,text/plain,application/pdf,text/markdown" onChange={(event) => { const file = event.target.files?.[0]; if (file) addDocument(file); event.currentTarget.value = ""; }} /></label></div>
          {selectedBase.items.length > 0 ? <div className="document-list">{selectedBase.items.map((document) => <article className="document-row" key={`${document.name}-${document.updated}`}><span className={`file-type ${document.type.toLowerCase()}`}>{document.type}</span><div className="document-copy"><strong>{document.name}</strong><small>{document.size} · 更新于 {document.updated}</small></div><DocumentStatus status={document.status} /><button type="button" className="document-more" aria-label={`${document.name} 更多操作`}><MoreHorizontal size={18} /></button></article>)}</div> : <div className="documents-empty"><span><Upload size={21} /></span><h3>还没有资料</h3><p>上传 PDF、Markdown 或 TXT 文件，开始构建可检索的知识库。</p><label className="upload-button secondary"><FileUp size={16} /> 上传第一份资料<input type="file" accept=".pdf,.txt,.md,text/plain,application/pdf,text/markdown" onChange={(event) => { const file = event.target.files?.[0]; if (file) addDocument(file); event.currentTarget.value = ""; }} /></label></div>}
          <div className="processing-note"><Sparkles size={15} /><span>文件上传后会自动解析、分段并建立检索索引。处理完成后即可用于 AI 对话。</span></div>
        </section>
      </div>

      {isCreateOpen && <div className="create-modal-layer" role="presentation"><button className="modal-backdrop" type="button" aria-label="关闭创建知识库弹窗" onClick={() => setIsCreateOpen(false)} /><section className="create-modal" role="dialog" aria-modal="true" aria-labelledby="create-library-title"><button className="modal-close" type="button" aria-label="关闭" onClick={() => setIsCreateOpen(false)}><X size={18} /></button><span className="modal-mark"><LibraryBig size={20} /></span><h3 id="create-library-title">创建知识库</h3><p>为一组相关资料建立专属空间，之后可以在 AI 对话中选择它。</p><label>知识库名称<input autoFocus value={newName} placeholder="例如：机器学习" onChange={(event) => setNewName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") createKnowledgeBase(); }} /></label><label>描述（可选）<textarea value={newDescription} placeholder="简单描述这个知识库的用途" onChange={(event) => setNewDescription(event.target.value)} /></label><div className="modal-actions"><button type="button" onClick={() => setIsCreateOpen(false)}>取消</button><button type="button" className="modal-primary" onClick={createKnowledgeBase} disabled={!newName.trim()}>创建知识库</button></div></section></div>}
    </div>
  );
}

function DocumentStatus({ status }: { status: KnowledgeDocument["status"] }) {
  const icon = status === "完成" ? <CheckCircle2 size={15} /> : status === "处理失败" ? <CircleAlert size={15} /> : <span className="status-spinner" />;
  return <span className={`document-status ${status === "完成" ? "done" : status === "处理失败" ? "failed" : "pending"}`}>{icon}{status}</span>;
}

function ChatPage() {
  return (
    <div className="chat-page">
      <div className="chat-toolbar">
        <button className="library-selector" type="button"><LibraryBig size={16} /><span>全部知识库</span><ChevronRight size={15} /></button>
        <p>回答将优先基于你已导入的资料</p>
        <button className="chat-new-button" type="button"><Plus size={16} /> 新建对话</button>
      </div>
      <div className="chat-workspace">
        <aside className="conversation-panel">
          <div className="conversation-panel-head"><span>对话历史</span><button type="button" aria-label="搜索对话"><Search size={16} /></button></div>
          <div className="conversation-group"><p>今天</p><button className="conversation-item is-selected" type="button"><MessageSquareText size={15} /><span>Transformer 的注意力机制</span></button><button className="conversation-item" type="button"><MessageSquareText size={15} /><span>RAG 的检索效果如何优化？</span></button></div>
          <div className="conversation-group"><p>昨天</p><button className="conversation-item" type="button"><MessageSquareText size={15} /><span>整理深度学习学习路径</span></button><button className="conversation-item" type="button"><MessageSquareText size={15} /><span>总结这篇论文的关键结论</span></button></div>
        </aside>
        <section className="chat-thread-shell" aria-label="AI 对话">
          <MyRuntimeProvider><Thread components={{ Welcome: ChatWelcome }} /></MyRuntimeProvider>
        </section>
        <aside className="citation-panel">
          <div className="citation-head"><span>对话信息</span><button type="button" aria-label="更多选项"><MoreHorizontal size={18} /></button></div>
          <div className="citation-empty"><span className="citation-empty-icon"><BookOpen size={19} /></span><h3>等待引用来源</h3><p>在知识库范围内提问后，相关的资料来源会在这里呈现。</p></div>
          <div className="chat-tips"><Sparkles size={16} /><p>小提示：选择特定知识库可以让回答更加聚焦。</p></div>
        </aside>
      </div>
    </div>
  );
}

function ChatWelcome() {
  return (
    <div className="chat-welcome">
      <span className="chat-welcome-mark"><Sparkles size={21} /></span>
      <h2>今天想探索什么？</h2>
      <p>我可以基于你的知识库回答问题、解释概念，或帮你整理思路。</p>
      <div className="prompt-grid"><span>总结一篇资料的核心观点</span><span>解释一个复杂概念</span><span>从笔记中提炼复习要点</span><span>比较两个相关的技术方案</span></div>
    </div>
  );
}

export default App;
