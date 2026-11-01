import { useCallback, useEffect, useRef, useState } from "react";
import {
  Bold,
  Check,
  Code2,
  FilePlus2,
  List,
  PencilLine,
  Search,
  Sparkles,
  Tag,
  Trash2,
  WandSparkles,
} from "lucide-react";
import { useChatStore } from "@/lib/chat-store";
import { useNoteNavStore } from "@/lib/note-nav-store";
import { useReaderStore } from "@/lib/reader-store";
import {
  createNote,
  deleteNote,
  getNote,
  runNoteAi,
  listNotes,
  listNoteTags,
  updateNote,
  type NoteDto,
  type NoteListItemDto,
  type NoteAiAction,
  type NotePatch,
  type NoteSourceDto,
} from "@/lib/api";

const AUTOSAVE_DELAY_MS = 800;

// 把 ISO 时间显示为“刚刚 / N 分钟前 / 日期”
const formatTime = (iso: string) => {
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  return new Date(iso).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" });
};

// AI 操作：replace 为 true 的会替换原文，其余在选区之后（或文末）插入
const AI_ACTIONS: { action: NoteAiAction; label: string; replace?: boolean }[] = [
  { action: "summary", label: "总结" },
  { action: "outline", label: "提纲" },
  { action: "keywords", label: "关键词" },
  { action: "explain", label: "概念解释" },
  { action: "rewrite", label: "改写", replace: true },
  { action: "polish", label: "润色", replace: true },
];

// AI 候选内容：original 为生成时送去处理的原文，range 为原文在笔记中的选区（整篇时为 null）
type AiDraft = { noteId: number; action: NoteAiAction; result: string; original: string; range: { start: number; end: number } | null };

const toListItem = (note: NoteDto): NoteListItemDto => ({ ...note, preview: note.content.slice(0, 200) });

export function NotesPage({ onNavigate }: { onNavigate: (label: string) => void }) {
  const [notes, setNotes] = useState<NoteListItemDto[]>([]);
  const [current, setCurrent] = useState<NoteDto | null>(null);
  const [query, setQuery] = useState("");
  const [isPreview, setIsPreview] = useState(false);
  const [aiDraft, setAiDraft] = useState<AiDraft | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [selection, setSelection] = useState({ start: 0, end: 0 });
  const [isAiOpen, setIsAiOpen] = useState(false);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved");
  const [error, setError] = useState<string | null>(null);
  // 标签筛选：tagOptions 为全部标签及数量，tagFilter 为当前筛选的标签（空表示不筛选）
  const [tagOptions, setTagOptions] = useState<{ tag: string; count: number }[]>([]);
  const [tagFilter, setTagFilter] = useState("");
  const [isTagMenuOpen, setIsTagMenuOpen] = useState(false);
  const [tagDraft, setTagDraft] = useState("");
  // 待保存的改动与保存队列：队列保证同一笔记的保存请求按顺序发出，不会被慢请求反超
  const pending = useRef<({ id: number } & NotePatch) | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const queue = useRef<Promise<void>>(Promise.resolve());

  const refreshTagOptions = useCallback(() => {
    listNoteTags().then(setTagOptions).catch(console.error);
  }, []);

  useEffect(refreshTagOptions, [refreshTagOptions]);

  const flush = useCallback((): Promise<void> => {
    window.clearTimeout(timer.current);
    const job = pending.current;
    if (!job) return queue.current;
    pending.current = null;
    queue.current = queue.current.then(async () => {
      try {
        const { id, ...patch } = job;
        const saved = await updateNote(id, patch);
        setNotes((items) => [toListItem(saved), ...items.filter((item) => item.id !== saved.id)]);
        if (patch.tags) refreshTagOptions();
        setSaveState(pending.current ? "saving" : "saved");
      } catch {
        // 失败时把改动放回待保存，下次编辑或切换时会重试
        pending.current = { ...job, ...pending.current };
        setSaveState("error");
      }
    });
    return queue.current;
  }, [refreshTagOptions]);

  // 离开页面时把未保存的改动发出去
  useEffect(() => () => void flush(), [flush]);

  // 搜索词停顿 250ms 后再请求；首次进入时也走这里加载列表
  useEffect(() => {
    const handle = window.setTimeout(() => {
      listNotes(query, tagFilter)
        .then((items) => {
          setNotes(items);
          setError(null);
        })
        .catch((reason: Error) => setError(reason.message));
    }, query ? 250 : 0);
    return () => window.clearTimeout(handle);
  }, [query, tagFilter]);

  const edit = (patch: NotePatch) => {
    if (!current) return;
    setCurrent({ ...current, ...patch });
    // 标题、分类被清空时先只改界面，不提交空值（失焦时会补回默认值）
    const { title, category, ...rest } = patch;
    pending.current = {
      ...pending.current,
      id: current.id,
      ...rest,
      ...(title?.trim() ? { title } : {}),
      ...(category?.trim() ? { category } : {}),
    };
    setSaveState("saving");
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void flush(), AUTOSAVE_DELAY_MS);
  };

  const addTag = () => {
    const tag = tagDraft.trim();
    setTagDraft("");
    if (current && tag && !current.tags.includes(tag) && current.tags.length < 10) edit({ tags: [...current.tags, tag] });
  };

  // 来源跳转：文档打开阅读抽屉并定位片段，对话则切到 AI 对话页并打开
  const openSource = (source: NoteSourceDto) => {
    if (source.type === "document") {
      useReaderStore.getState().open(source.refId, source.chunkId ?? undefined);
      return;
    }
    useChatStore.getState().openConversation(source.refId).then(() => onNavigate("AI 对话")).catch((reason: Error) => setError(reason.message));
  };

  const selectNote = async (id: number) => {
    await flush();
    try {
      setCurrent(await getNote(id));
      setAiDraft(null);
      setAiError(null);
      setSelection({ start: 0, end: 0 });
      setSaveState("saved");
    } catch (reason) {
      setError((reason as Error).message);
    }
  };

  // 别处（阅读抽屉、对话菜单）请求打开某篇笔记时，读取并清空请求后选中它
  const pendingNoteId = useNoteNavStore((state) => state.pendingNoteId);
  useEffect(() => {
    if (pendingNoteId === null) return;
    useNoteNavStore.getState().consume();
    void selectNote(pendingNoteId);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- selectNote 每次渲染都会重建，只在请求变化时触发
  }, [pendingNoteId]);

  const newNote = async () => {
    await flush();
    try {
      const note = await createNote();
      setNotes((items) => [toListItem(note), ...items]);
      setCurrent(note);
      setIsPreview(false);
      setAiDraft(null);
      setAiError(null);
      setSelection({ start: 0, end: 0 });
      setSaveState("saved");
    } catch (reason) {
      setError((reason as Error).message);
    }
  };

  const removeNote = async () => {
    if (!current || !window.confirm(`确定删除笔记“${current.title}”吗？删除后无法恢复。`)) return;
    window.clearTimeout(timer.current);
    pending.current = null;
    try {
      await deleteNote(current.id);
      setNotes((items) => items.filter((item) => item.id !== current.id));
      setCurrent(null);
      setSaveState("saved");
    } catch (reason) {
      setError((reason as Error).message);
    }
  };
  // 有选中文字时只处理选区，否则处理整篇
  const aiRange = current && selection.end > selection.start && selection.end <= current.content.length ? selection : null;

  const runAi = async (action: NoteAiAction) => {
    if (!current) return;
    const original = aiRange ? current.content.slice(aiRange.start, aiRange.end) : current.content;
    if (!original.trim()) {
      setAiError("笔记还没有内容");
      return;
    }
    setAiBusy(true);
    setAiError(null);
    setAiDraft(null);
    try {
      const { result } = await runNoteAi(action, original);
      setAiDraft({ noteId: current.id, action, result, original, range: aiRange });
    } catch (reason) {
      setAiError((reason as Error).message);
    } finally {
      setAiBusy(false);
    }
  };

  // 用户确认后才写入笔记；选区位置可能因期间的编辑而偏移，先核对原文
  const applyAiDraft = () => {
    if (!current || !aiDraft || aiDraft.noteId !== current.id) return;
    const { action, result, original, range } = aiDraft;
    const content = current.content;
    const start = range && content.slice(range.start, range.end) === original ? range.start : content.indexOf(original);
    if (start < 0) {
      setAiError("原文已发生变化，请重新生成");
      setAiDraft(null);
      return;
    }
    const end = start + original.length;
    const replace = AI_ACTIONS.find((item) => item.action === action)?.replace;
    edit({ content: replace ? content.slice(0, start) + result + content.slice(end) : `${content.slice(0, end)}\n\n${result}${content.slice(end)}` });
    setAiDraft(null);
  };

  // 草稿只对生成它的那篇笔记有效
  const draft = aiDraft && aiDraft.noteId === current?.id ? aiDraft : null;

  return (
    <div className="notes-page">
      <div className="notes-page-head">
        <div>
          <p className="eyebrow">知识沉淀</p>
          <h2>我的笔记</h2>
        </div>
        <button className="knowledge-create" type="button" onClick={() => void newNote()}>
          <FilePlus2 size={17} /> 新建笔记
        </button>
      </div>
      <div className={`notes-workspace${isAiOpen ? " has-ai" : ""}`}>
        <aside className="notes-list-panel">
          <div className="notes-search">
            <Search size={16} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索笔记"
            />
          </div>
          <div className="notes-filter-row">
            <span>
              {query || tagFilter ? "筛选结果" : "全部笔记"} <b>{notes.length}</b>
            </span>
            <div className="notes-tag-filter">
              <button type="button" aria-haspopup="menu" onClick={() => setIsTagMenuOpen((open) => !open)}>
                <Tag size={14} /> {tagFilter ? `#${tagFilter}` : "标签"}
              </button>
              {isTagMenuOpen && (
                <>
                  <button className="menu-backdrop" type="button" aria-label="关闭菜单" onClick={() => setIsTagMenuOpen(false)} />
                  <div className="conversation-menu" role="menu">
                    <button type="button" role="menuitem" onClick={() => { setTagFilter(""); setIsTagMenuOpen(false); }}>
                      全部标签
                    </button>
                    {tagOptions.map((option) => (
                      <button type="button" role="menuitem" key={option.tag} onClick={() => { setTagFilter(option.tag); setIsTagMenuOpen(false); }}>
                        #{option.tag} <small>{option.count}</small>
                      </button>
                    ))}
                    {tagOptions.length === 0 && <small className="notes-tag-empty">还没有标签</small>}
                  </div>
                </>
              )}
            </div>
          </div>
          <div className="notes-list">
            {notes.map((note) => (
              <button
                type="button"
                key={note.id}
                onClick={() => void selectNote(note.id)}
                className={`note-list-item${note.id === current?.id ? " selected" : ""}`}
              >
                <strong>{note.title}</strong>
                <p>
                  {note.preview
                    .replace(/^#.*\n?/, "")
                    .replace(/[#*>-]/g, "")
                    .trim()
                    .slice(0, 52)}
                </p>
                <small>
                  <span>{note.category}</span> · {formatTime(note.updatedAt)}
                </small>
              </button>
            ))}
          </div>
          {notes.length === 0 && !error && (
            <div className="notes-no-result">{query || tagFilter ? "没有找到匹配的笔记" : "还没有笔记，点击右上角新建"}</div>
          )}
          {error && <div className="notes-no-result">{error}</div>}
        </aside>

        <section className="note-editor-section">
          {!current ? (
            <div className="notes-no-result">选择左侧的笔记，或新建一篇</div>
          ) : (
            <>
          <header className="note-editor-header">
            <div>
              <input
                className="note-title-input"
                value={current.title}
                aria-label="笔记标题"
                onChange={(event) => edit({ title: event.target.value })}
                onBlur={() => !current.title.trim() && edit({ title: "未命名笔记" })}
              />
              <p>
                {saveState === "saving" ? "保存中…" : saveState === "error" ? "保存失败，将自动重试" : `已保存 · ${formatTime(notes.find((item) => item.id === current.id)?.updatedAt ?? current.updatedAt)}`}
              </p>
              <div className="note-meta">
                <input
                  className="note-category-input"
                  value={current.category}
                  maxLength={50}
                  aria-label="分类"
                  onChange={(event) => edit({ category: event.target.value })}
                  onBlur={() => !current.category.trim() && edit({ category: "未分类" })}
                />
                {current.tags.map((tag) => (
                  <span className="note-tag" key={tag}>
                    #{tag}
                    <button type="button" aria-label={`移除标签 ${tag}`} onClick={() => edit({ tags: current.tags.filter((item) => item !== tag) })}>
                      ×
                    </button>
                  </span>
                ))}
                <input
                  className="note-tag-input"
                  value={tagDraft}
                  maxLength={20}
                  placeholder="添加标签"
                  aria-label="添加标签"
                  onChange={(event) => setTagDraft(event.target.value)}
                  onBlur={addTag}
                  onKeyDown={(event) => {
                    // 输入法选词时的回车不算提交
                    if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                      event.preventDefault();
                      addTag();
                    }
                  }}
                />
              </div>
            </div>
            <div className="editor-actions">
              <button
                type="button"
                className={!isPreview ? "is-active" : ""}
                onClick={() => setIsPreview(false)}
              >
                <PencilLine size={15} /> 编辑
              </button>
              <button
                type="button"
                className={isPreview ? "is-active" : ""}
                onClick={() => setIsPreview(true)}
              >
                <EyeIcon /> 预览
              </button>
              <button
                type="button"
                className={isAiOpen ? "is-active" : ""}
                onClick={() => setIsAiOpen((open) => !open)}
              >
                <WandSparkles size={15} /> AI 辅助
              </button>
              <button type="button" aria-label="删除笔记" title="删除笔记" onClick={() => void removeNote()}>
                <Trash2 size={16} />
              </button>
            </div>
          </header>
          <div className="editor-toolbar">
            <button type="button" title="粗体">
              <Bold size={16} />
            </button>
            <button type="button" title="列表">
              <List size={16} />
            </button>
            <button type="button" title="代码">
              <Code2 size={16} />
            </button>
            <span />
            <button type="button" title="插入标签">
              <Tag size={16} />
            </button>
          </div>
          {isPreview ? (
            <article className="markdown-preview">
              <MarkdownPreview content={current.content} />
            </article>
          ) : (
            <textarea
              className="note-editor"
              value={current.content}
              placeholder="开始记录你的想法…"
              onChange={(event) => edit({ content: event.target.value })}
              onSelect={(event) => setSelection({ start: event.currentTarget.selectionStart, end: event.currentTarget.selectionEnd })}
              spellCheck
            />
          )}
          {current.sources.length > 0 && (
            <footer className="note-sources">
              <small>来源</small>
              {current.sources.map((source) => (
                <button
                  className="source-chip"
                  type="button"
                  key={source.id}
                  disabled={!source.available}
                  title={source.available ? (source.type === "document" ? "打开文档" : "打开对话") : "原资源已被删除"}
                  onClick={() => openSource(source)}
                >
                  <b>{source.type === "document" ? "文" : "话"}</b>
                  <span>{source.label}</span>
                </button>
              ))}
            </footer>
          )}
            </>
          )}
        </section>

        {isAiOpen && (
        <aside className="note-ai-panel">
          <div className="note-ai-heading">
            <span>
              <WandSparkles size={16} />
            </span>
            <div>
              <strong>AI 笔记辅助</strong>
              <p>基于当前笔记或选区生成候选内容</p>
            </div>
          </div>
          <p className="ai-scope">
            作用范围：{aiRange ? `选中的 ${aiRange.end - aiRange.start} 字` : "整篇笔记"}
          </p>
          <div className="ai-actions">
            {AI_ACTIONS.map((item) => (
              <button type="button" key={item.action} disabled={aiBusy} onClick={() => void runAi(item.action)}>
                {item.label}
              </button>
            ))}
          </div>
          {aiBusy && <p className="ai-status">正在生成…</p>}
          {aiError && <p className="form-error" role="alert">{aiError}</p>}
          {draft ? (
            <div className="ai-draft">
              <p className="section-kicker">AI 候选内容</p>
              {AI_ACTIONS.find((item) => item.action === draft.action)?.replace && (
                <details className="ai-original">
                  <summary>查看原文</summary>
                  <pre>{draft.original}</pre>
                </details>
              )}
              <div className="ai-draft-content">
                <MarkdownPreview content={draft.result} />
              </div>
              <div className="ai-draft-actions">
                <button type="button" onClick={() => setAiDraft(null)}>
                  保留原文
                </button>
                <button type="button" className="accept-draft" onClick={applyAiDraft}>
                  {AI_ACTIONS.find((item) => item.action === draft.action)?.replace ? "替换原文" : "插入笔记"} <Check size={14} />
                </button>
              </div>
            </div>
          ) : (
            !aiBusy && (
              <div className="ai-guidance">
                <Sparkles size={17} />
                <p>AI 只生成候选内容，需要你确认后才会写入笔记。选中一段文字可只处理选区。</p>
              </div>
            )
          )}
        </aside>
        )}
      </div>
    </div>
  );
}

function EyeIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="15"
      height="15"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" />
      <circle cx="12" cy="12" r="2.5" />
    </svg>
  );
}

function MarkdownPreview({ content }: { content: string }) {
  return (
    <>
      {content
        .split("\n")
        .map((line, index) =>
          line.startsWith("# ") ? (
            <h1 key={`${line}-${index}`}>{line.slice(2)}</h1>
          ) : line.startsWith("## ") ? (
            <h2 key={`${line}-${index}`}>{line.slice(3)}</h2>
          ) : line.startsWith("- ") ? (
            <li key={`${line}-${index}`}>{line.slice(2)}</li>
          ) : line.startsWith("> ") ? (
            <blockquote key={`${line}-${index}`}>{line.slice(2)}</blockquote>
          ) : line ? (
            <p key={`${line}-${index}`}>{line.replaceAll("**", "")}</p>
          ) : (
            <br key={`empty-${index}`} />
          ),
        )}
    </>
  );
}
