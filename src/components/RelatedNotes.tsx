import { useEffect, useState } from "react";
import { FileText } from "lucide-react";
import { listNotesBySource, type NoteListItemDto } from "@/lib/api";

type Loaded = { key: string; notes: NoteListItemDto[] };

// 引用了某个文档或对话的笔记；没有时不渲染。结果带上请求的 key，切换对象时旧结果自动失效
export function RelatedNotes({ type, refId, onOpen }: { type: "document" | "conversation"; refId: number; onOpen: (noteId: number) => void }) {
  const key = `${type}:${refId}`;
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    let cancelled = false;
    listNotesBySource(type, refId)
      .then((notes) => !cancelled && setLoaded({ key, notes }))
      .catch(console.error);
    return () => {
      cancelled = true;
    };
  }, [type, refId, key]);

  const notes = loaded?.key === key ? loaded.notes : [];
  if (notes.length === 0) return null;

  return (
    <div className="related-notes">
      <small>相关笔记</small>
      {notes.map((note) => (
        <button type="button" key={note.id} title={note.title} onClick={() => onOpen(note.id)}>
          <FileText size={13} />
          <span>{note.title}</span>
        </button>
      ))}
    </div>
  );
}
