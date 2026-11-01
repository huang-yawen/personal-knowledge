import { useAuiState } from "@assistant-ui/react";
import type { ChatSource } from "@/lib/api";
import { useReaderStore } from "@/lib/reader-store";

// 回答下方的来源标签：来源保存在消息的 metadata.custom.sources，点击打开阅读抽屉并定位到片段
export function MessageSources() {
  const sources = useAuiState((s) => s.message.metadata.custom?.sources) as ChatSource[] | undefined;
  const openReader = useReaderStore((state) => state.open);
  if (!sources || sources.length === 0) return null;

  return (
    <div className="message-sources">
      <small>来源</small>
      {sources.map((source) => (
        <button
          className="source-chip"
          type="button"
          key={source.chunkId}
          title={`${source.page ? `第 ${source.page} 页 · ` : ""}相似度 ${source.score.toFixed(2)}`}
          onClick={() => openReader(source.documentId, source.chunkId)}
        >
          <b>{source.index}</b>
          <span>{source.documentName}</span>
        </button>
      ))}
    </div>
  );
}
