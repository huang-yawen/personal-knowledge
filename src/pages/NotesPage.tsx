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
import { createNote, deleteNote, getNote, listNotes, updateNote, type NoteDto, type NoteListItemDto } from "@/lib/api";

const AUTOSAVE_DELAY_MS = 800;

// 把 ISO 时间显示为“刚刚 / N 分钟前 / 日期”
const formatTime = (iso: string) => {
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  return new Date(iso).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" });
};

const toListItem = (note: NoteDto): NoteListItemDto => ({ ...note, preview: note.content.slice(0, 200) });

export function NotesPage() {
  const [notes, setNotes] = useState<NoteListItemDto[]>([]);
  const [current, setCurrent] = useState<NoteDto | null>(null);
  const [query, setQuery] = useState("");
  const [isPreview, setIsPreview] = useState(false);
  const [aiDraft, setAiDraft] = useState<string | null>(null);
  const [isAiOpen, setIsAiOpen] = useState(false);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved");
  const [error, setError] = useState<string | null>(null);
  // 待保存的改动与保存队列：队列保证同一笔记的保存请求按顺序发出，不会被慢请求反超
  const pending = useRef<{ id: number; title?: string; content?: string } | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const queue = useRef<Promise<void>>(Promise.resolve());

  const flush = useCallback((): Promise<void> => {
    window.clearTimeout(timer.current);
    const job = pending.current;
    if (!job) return queue.current;
    pending.current = null;
    queue.current = queue.current.then(async () => {
      try {
        const saved = await updateNote(job.id, { title: job.title, content: job.content });
        setNotes((items) => [toListItem(saved), ...items.filter((item) => item.id !== saved.id)]);
        setSaveState(pending.current ? "saving" : "saved");
      } catch {
        // 失败时把改动放回待保存，下次编辑或切换时会重试
        pending.current = { ...job, ...pending.current };
        setSaveState("error");
      }
    });
    return queue.current;
  }, []);

  // 离开页面时把未保存的改动发出去
  useEffect(() => () => void flush(), [flush]);

  // 搜索词停顿 250ms 后再请求；首次进入时也走这里加载列表
  useEffect(() => {
    const handle = window.setTimeout(() => {
      listNotes(query)
        .then((items) => {
          setNotes(items);
          setError(null);
        })
        .catch((reason: Error) => setError(reason.message));
    }, query ? 250 : 0);
    return () => window.clearTimeout(handle);
  }, [query]);

  const edit = (patch: { title?: string; content?: string }) => {
    if (!current) return;
    setCurrent({ ...current, ...patch });
    // 标题被清空时先只改界面，不提交空标题（失焦时会补回默认标题）
    const { title, ...rest } = patch;
    pending.current = { ...pending.current, id: current.id, ...rest, ...(title?.trim() ? { title } : {}) };
    setSaveState("saving");
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void flush(), AUTOSAVE_DELAY_MS);
  };

  const selectNote = async (id: number) => {
    await flush();
    try {
      setCurrent(await getNote(id));
      setAiDraft(null);
      setSaveState("saved");
    } catch (reason) {
      setError((reason as Error).message);
    }
  };

  const newNote = async () => {
    await flush();
    try {
      const note = await createNote();
      setNotes((items) => [toListItem(note), ...items]);
      setCurrent(note);
      setIsPreview(false);
      setAiDraft(null);
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
  const createAiDraft = () =>
    current &&
    setAiDraft(
      `# ${current.title}\n\n## 核心摘要\n\n${current.content
        .replace(/^#.*\n?/, "")
        .split("\n")
        .filter(Boolean)
        .slice(0, 3)
        .join(
          " ",
        )}\n\n## 建议的后续行动\n\n- 补充可验证的资料来源\n- 在下一次回顾时更新理解\n`,
    );

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
              {query ? "搜索结果" : "全部笔记"} <b>{notes.length}</b>
            </span>
            <button type="button">
              <Tag size={14} /> 标签
            </button>
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
            <div className="notes-no-result">{query ? "没有找到匹配的笔记" : "还没有笔记，点击右上角新建"}</div>
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
                <span>{current.category}</span> ·{" "}
                {saveState === "saving" ? "保存中…" : saveState === "error" ? "保存失败，将自动重试" : `已保存 · ${formatTime(notes.find((item) => item.id === current.id)?.updatedAt ?? current.updatedAt)}`}
              </p>
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
              spellCheck
            />
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
              <p>基于当前笔记生成候选内容</p>
            </div>
          </div>
          <div className="ai-actions">
            <button type="button" onClick={createAiDraft}>
              总结笔记
            </button>
            <button type="button" onClick={createAiDraft}>
              提取知识点
            </button>
            <button type="button" onClick={createAiDraft}>
              优化表达
            </button>
          </div>
          {aiDraft ? (
            <div className="ai-draft">
              <p className="section-kicker">AI 生成草稿</p>
              <div className="ai-draft-content">
                <MarkdownPreview content={aiDraft} />
              </div>
              <div className="ai-draft-actions">
                <button type="button" onClick={() => setAiDraft(null)}>
                  保留原文
                </button>
                <button
                  type="button"
                  className="accept-draft"
                  onClick={() => {
                    edit({ content: aiDraft });
                    setAiDraft(null);
                  }}
                >
                  应用草稿 <Check size={14} />
                </button>
              </div>
            </div>
          ) : (
            <div className="ai-guidance">
              <Sparkles size={17} />
              <p>AI 的修改始终以草稿形式展示，需要你确认后才会覆盖笔记内容。</p>
            </div>
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
