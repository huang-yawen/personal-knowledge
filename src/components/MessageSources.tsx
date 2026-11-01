import { BookOpen, Lightbulb } from "lucide-react";
import { useAuiState } from "@assistant-ui/react";
import type { ChatSource } from "@/lib/api";
import { useReaderStore } from "@/lib/reader-store";

// 模型用自身知识写的段落以这个标记开头（见 server 的提示词）
const GENERAL_MARK = "【通用知识】";

const basisNotes = {
  knowledge: { Icon: BookOpen, text: "以上内容依据知识库资料，来源见上方标签。" },
  mixed: {
    Icon: BookOpen,
    text: `部分内容来自知识库（带编号，来源见上方标签）；标注“${GENERAL_MARK}”的部分来自模型自身知识，请自行核实。`,
  },
  general: { Icon: Lightbulb, text: "知识库中没有相关内容，以上为模型根据通用知识的回答，请自行核实。" },
  strictEmpty: { Icon: BookOpen, text: "严格模式：知识库资料不足，没有使用通用知识作答。可在个人中心关闭严格模式。" },
};

// 严格模式下资料不足时，提示词要求模型使用的固定说法
const STRICT_EMPTY_MARKS = ["知识库中没有找到相关内容。", "知识库资料中没有足够的信息"];

// 回答下方的来源标签与依据说明：来源保存在消息的 metadata.custom.sources，点击打开阅读抽屉并定位到片段。
// 依据说明由回答文字和来源推算，历史对话也能显示
export function MessageSources() {
  const sources = useAuiState((s) => s.message.metadata.custom?.sources) as ChatSource[] | undefined;
  const text = useAuiState((s) => s.message.content.flatMap((part) => (part.type === "text" ? [part.text] : [])).join(""));
  // 最新一条回答还在生成时先不显示，避免说明随内容跳变
  const isStreaming = useAuiState((s) => s.thread.isRunning && s.message.isLast);
  const openReader = useReaderStore((state) => state.open);
  if (isStreaming || !text.trim()) return null;

  const hasSources = Boolean(sources && sources.length > 0);
  const isStrictEmpty = !hasSources && STRICT_EMPTY_MARKS.some((mark) => text.includes(mark));
  const note = basisNotes[isStrictEmpty ? "strictEmpty" : !hasSources ? "general" : text.includes(GENERAL_MARK) ? "mixed" : "knowledge"];

  return (
    <div className="message-basis-wrap">
      {hasSources && (
        <div className="message-sources">
          <small>来源</small>
          {sources?.map((source) => (
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
      )}
      <p className="message-basis">
        <note.Icon size={13} /> {note.text}
      </p>
    </div>
  );
}
