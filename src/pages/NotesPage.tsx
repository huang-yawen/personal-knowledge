import { useState } from "react";
import {
  Bold,
  Check,
  Code2,
  FilePlus2,
  List,
  MoreHorizontal,
  PencilLine,
  Search,
  Sparkles,
  Tag,
  WandSparkles,
} from "lucide-react";
import { initialNotes } from "@/mock/data";
import type { Note } from "@/types";

export function NotesPage() {
  const [notes, setNotes] = useState(initialNotes);
  const [selectedId, setSelectedId] = useState(1);
  const [query, setQuery] = useState("");
  const [isPreview, setIsPreview] = useState(false);
  const [aiDraft, setAiDraft] = useState<string | null>(null);
  const selectedNote = notes.find((note) => note.id === selectedId) ?? notes[0];
  const visibleNotes = notes.filter((note) =>
    `${note.title} ${note.category} ${note.tags.join(" ")}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );

  const updateNote = (content: string) =>
    setNotes((items) =>
      items.map((note) =>
        note.id === selectedNote.id
          ? { ...note, content, updated: "刚刚" }
          : note,
      ),
    );
  const newNote = () => {
    const id = Math.max(...notes.map((note) => note.id), 0) + 1;
    const note: Note = {
      id,
      title: "未命名笔记",
      content: "# 未命名笔记\n\n开始记录你的想法…",
      category: "未分类",
      tags: [],
      updated: "刚刚",
    };
    setNotes((items) => [note, ...items]);
    setSelectedId(id);
    setIsPreview(false);
    setAiDraft(null);
  };
  const createAiDraft = () =>
    setAiDraft(
      `# ${selectedNote.title}\n\n## 核心摘要\n\n${selectedNote.content
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
        <button className="knowledge-create" type="button" onClick={newNote}>
          <FilePlus2 size={17} /> 新建笔记
        </button>
      </div>
      <div className="notes-workspace">
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
              全部笔记 <b>{notes.length}</b>
            </span>
            <button type="button">
              <Tag size={14} /> 标签
            </button>
          </div>
          <div className="notes-list">
            {visibleNotes.map((note) => (
              <button
                type="button"
                key={note.id}
                onClick={() => {
                  setSelectedId(note.id);
                  setAiDraft(null);
                }}
                className={`note-list-item${note.id === selectedNote.id ? " selected" : ""}`}
              >
                <strong>{note.title}</strong>
                <p>
                  {note.content
                    .replace(/^#.*\n?/, "")
                    .replace(/[#*>-]/g, "")
                    .trim()
                    .slice(0, 52)}
                </p>
                <small>
                  <span>{note.category}</span> · {note.updated}
                </small>
              </button>
            ))}
          </div>
          {visibleNotes.length === 0 && (
            <div className="notes-no-result">没有找到匹配的笔记</div>
          )}
        </aside>

        <section className="note-editor-section">
          <header className="note-editor-header">
            <div>
              <input
                className="note-title-input"
                value={selectedNote.title}
                aria-label="笔记标题"
                onChange={(event) =>
                  setNotes((items) =>
                    items.map((note) =>
                      note.id === selectedNote.id
                        ? {
                            ...note,
                            title: event.target.value,
                            updated: "刚刚",
                          }
                        : note,
                    ),
                  )
                }
              />
              <p>
                <span>{selectedNote.category}</span> · 已保存 ·{" "}
                {selectedNote.updated}
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
              <button type="button" aria-label="更多笔记操作">
                <MoreHorizontal size={18} />
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
              <MarkdownPreview content={selectedNote.content} />
            </article>
          ) : (
            <textarea
              className="note-editor"
              value={selectedNote.content}
              onChange={(event) => updateNote(event.target.value)}
              spellCheck
            />
          )}
        </section>

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
                    updateNote(aiDraft);
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
