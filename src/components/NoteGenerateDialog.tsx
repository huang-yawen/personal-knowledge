import { useState } from "react";
import { createNote, generateNote, type NoteDto, type NoteSourceInput } from "@/lib/api";
import { MarkdownView } from "@/components/MarkdownView";

type Draft = { title: string; content: string; sources: NoteSourceInput[] };

// AI 生成笔记：输入主题 → 基于知识库资料生成草稿预览 → 确认后才保存为笔记
export function NoteGenerateDialog({ onClose, onSaved }: { onClose: () => void; onSaved: (note: NoteDto) => void }) {
  const [topic, setTopic] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = async () => {
    if (!topic.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      setDraft(await generateNote(topic.trim()));
    } catch (reason) {
      setDraft(null);
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!draft || busy) return;
    setBusy(true);
    setError(null);
    try {
      onSaved(await createNote(draft));
    } catch (reason) {
      setError((reason as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="summary-overlay" role="dialog" aria-label="AI 生成笔记" onClick={onClose}>
      <div className="summary-dialog generate-dialog" onClick={(event) => event.stopPropagation()}>
        <h3>AI 生成笔记</h3>
        <p className="generate-hint">输入主题，将在全部知识库中检索资料并写成带引用的笔记草稿，确认后才会保存。</p>
        <textarea
          className="generate-topic"
          value={topic}
          maxLength={200}
          rows={2}
          placeholder="例如：向量检索的基本原理"
          aria-label="笔记主题"
          onChange={(event) => setTopic(event.target.value)}
        />
        {busy && !draft && <p className="ai-status">正在检索并生成…</p>}
        {error && <p className="form-error" role="alert">{error}</p>}
        {draft && (
          <div className="generate-draft markdown-preview">
            <MarkdownView content={draft.content} />
          </div>
        )}
        <div className="summary-actions">
          <button type="button" onClick={onClose}>放弃</button>
          <button type="button" disabled={busy || !topic.trim()} onClick={() => void generate()}>
            {draft ? "重新生成" : "生成草稿"}
          </button>
          {draft && (
            <button type="button" className="accept-draft" disabled={busy} onClick={() => void save()}>
              保存为笔记
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
