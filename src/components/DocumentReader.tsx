import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { getDocumentChunks, type DocumentChunkDto, type DocumentDto } from "@/lib/api";
import { RelatedNotes } from "@/components/RelatedNotes";
import { useReaderStore } from "@/lib/reader-store";

type Loaded = { document: DocumentDto; chunks: DocumentChunkDto[] };
// 结果带上请求的文档 id，切换文档时旧结果自动失效，不需要在 effect 里同步重置状态
type Result = { id: number; data?: Loaded; error?: string };

// 文档阅读抽屉：按分块展示解析后的原文，从引用打开时滚动到对应分块并高亮
export function DocumentReader({ onOpenNote }: { onOpenNote: (noteId: number) => void }) {
  const { documentId, chunkId, close } = useReaderStore();
  const [result, setResult] = useState<Result | null>(null);
  const targetRef = useRef<HTMLElement | null>(null);
  const current = result?.id === documentId ? result : null;
  const loaded = current?.data ?? null;
  const error = current?.error ?? "";

  useEffect(() => {
    if (documentId === null) return;
    let cancelled = false;
    getDocumentChunks(documentId)
      .then((data) => !cancelled && setResult({ id: documentId, data }))
      .catch((reason: Error) => !cancelled && setResult({ id: documentId, error: reason.message }));
    return () => {
      cancelled = true;
    };
  }, [documentId]);

  // 内容渲染完成后再滚动到被引用的分块
  useEffect(() => {
    if (loaded && chunkId !== null) targetRef.current?.scrollIntoView({ block: "center" });
  }, [loaded, chunkId]);

  useEffect(() => {
    if (documentId === null) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [documentId, close]);

  if (documentId === null) return null;

  return (
    <div className="reader-layer" role="presentation">
      <button className="modal-backdrop" type="button" aria-label="关闭阅读视图" onClick={close} />
      <aside className="reader-panel" role="dialog" aria-label="文档阅读">
        <header className="reader-head">
          <div className="reader-title">
            <strong>{loaded?.document.name ?? "加载中…"}</strong>
            {loaded && <small>{loaded.chunks.length} 个片段{new Set(loaded.chunks.map((chunk) => chunk.page).filter(Boolean)).size > 0 ? ` · ${new Set(loaded.chunks.map((chunk) => chunk.page).filter(Boolean)).size} 页` : ""}</small>}
          </div>
          <button type="button" aria-label="关闭" onClick={close}><X size={18} /></button>
        </header>
        <RelatedNotes type="document" refId={documentId} onOpen={onOpenNote} />
        <div className="reader-body">
          {error && <p className="form-error" role="alert">{error}</p>}
          {loaded && loaded.chunks.length === 0 && <p className="reader-empty">该文档还没有可阅读的内容（可能仍在处理中或处理失败）。</p>}
          {loaded?.chunks.map((chunk, index) => {
            // 页码变化时插入页码标题
            const showPage = chunk.page !== null && chunk.page !== loaded.chunks[index - 1]?.page;
            const isTarget = chunk.id === chunkId;
            return (
              <div key={chunk.id}>
                {showPage && <p className="reader-page">第 {chunk.page} 页</p>}
                <section ref={isTarget ? targetRef : undefined} className={`reader-chunk${isTarget ? " is-target" : ""}`}>
                  {chunk.content}
                </section>
              </div>
            );
          })}
        </div>
      </aside>
    </div>
  );
}
