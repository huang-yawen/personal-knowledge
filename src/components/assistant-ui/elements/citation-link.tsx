import { useAuiState } from "@assistant-ui/react";
import type { ChatSource } from "@/lib/api";
import { useReaderStore } from "@/lib/reader-store";

/**
 * 正文里的引用角标。
 *
 * 来源在回答结束后才通过 SSE 到达，所以生成过程中先渲染成中性角标；
 * 来源到达后，能对应上的变成可点击按钮，对不上的标红并提示。
 */
export function CitationLink({ href }: { href: string }) {
  const sources = useAuiState((state) => state.message.metadata.custom?.sources) as ChatSource[] | undefined;
  const streaming = useAuiState((state) => state.thread.isRunning && state.message.isLast);
  // 被用户停止的回答引用可能没存全，不能按「引用了不存在的资料」处理
  const incomplete = useAuiState((state) => state.message.metadata.custom?.incomplete) as boolean | undefined;
  const openReader = useReaderStore((state) => state.open);

  const numbers = href
    .replace(/^#cite-/, "")
    .split(",")
    .map((part) => Number.parseInt(part, 10))
    .filter((number) => Number.isInteger(number) && number > 0);

  return (
    <sup className="citation-sup">
      {numbers.map((number) => {
        const source = sources?.find((item) => item.index === number);
        if (source) {
          return (
            <button
              key={number}
              type="button"
              className="citation-mark"
              title={`${source.documentName}${source.page ? ` · 第 ${source.page} 页` : ""}`}
              aria-label={`打开引用 ${number}：${source.documentName}`}
              onClick={() => openReader(source.documentId, source.chunkId)}
            >
              {number}
            </button>
          );
        }
        if (streaming || incomplete) {
          return <span key={number} className="citation-pending">{number}</span>;
        }
        return (
          <span key={number} className="citation-invalid" title="回答引用了不存在的资料编号">
            {number}
          </span>
        );
      })}
    </sup>
  );
}
