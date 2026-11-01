import { useState } from "react";
import { BookmarkPlus, Check } from "lucide-react";
import { useAuiState } from "@assistant-ui/react";
import { createNote, type ChatSource, type NoteSourceInput } from "@/lib/api";
import { useChatStore } from "@/lib/chat-store";

// 回答下方的“保存为笔记”：标题取对应提问，正文为回答 + 来源列表，保存后可在“我的笔记”里继续编辑
export function MessageSaveNote() {
  const answer = useAuiState((s) =>
    s.message.content.flatMap((part) => (part.type === "text" ? [part.text] : [])).join(""),
  );
  const question = useAuiState((s) => {
    const previous = s.thread.messages[s.message.index - 1];
    return previous?.role === "user" ? previous.content.flatMap((part) => (part.type === "text" ? [part.text] : [])).join("") : "";
  });
  const sources = useAuiState((s) => s.message.metadata.custom?.sources) as ChatSource[] | undefined;
  // 最新一条回答还在生成时不显示
  const isStreaming = useAuiState((s) => s.thread.isRunning && s.message.isLast);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  if (isStreaming || !answer.trim()) return null;

  const save = async () => {
    setState("saving");
    const documents = [...new Set((sources ?? []).map((source) => `《${source.documentName}》`))];
    const content = documents.length > 0 ? `${answer}\n\n---\n\n来源：\n${documents.map((name) => `- ${name}`).join("\n")}\n` : answer;
    const title = Array.from(question.trim().replace(/\s+/g, " ")).slice(0, 40).join("") || "对话摘录";
    // 来源：被引用的文档（每个文档取排名最靠前的片段）+ 当前对话
    const noteSources: NoteSourceInput[] = [];
    for (const source of sources ?? []) {
      if (!noteSources.some((item) => item.type === "document" && item.refId === source.documentId)) {
        noteSources.push({ type: "document", refId: source.documentId, chunkId: source.chunkId, label: source.documentName });
      }
    }
    const { conversationId, conversations } = useChatStore.getState();
    if (conversationId !== null) {
      noteSources.push({
        type: "conversation",
        refId: conversationId,
        label: conversations.find((item) => item.id === conversationId)?.title ?? title,
      });
    }
    try {
      await createNote({ title, content, sources: noteSources });
      setState("saved");
    } catch (reason) {
      console.error(reason);
      setState("error");
    }
  };

  return (
    <div className="message-save">
      <button type="button" disabled={state === "saving" || state === "saved"} onClick={() => void save()}>
        {state === "saved" ? <Check size={14} /> : <BookmarkPlus size={14} />}
        {state === "saved" ? "已保存到我的笔记" : state === "saving" ? "保存中…" : state === "error" ? "保存失败，点击重试" : "保存为笔记"}
      </button>
    </div>
  );
}
