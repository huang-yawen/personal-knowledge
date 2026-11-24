import { useEffect, useState } from "react";
import { ChevronDown, LibraryBig, Sparkles } from "lucide-react";
import { useAui } from "@assistant-ui/react";
import { Thread } from "@/components/assistant-ui/elements/thread.aui";
import { FeedbackDialog } from "@/components/FeedbackDialog";
import { FeedbackNotice } from "@/components/FeedbackNotice";
import { listKnowledgeBases, type KnowledgeBaseDto } from "@/lib/api";
import { useChatStore } from "@/lib/chat-store";
import { MyRuntimeProvider } from "@/MyRuntimeProvider";
import { useEscapeKey } from "@/hooks/use-escape-key";

export function ChatPage() {
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBaseDto[]>([]);
  const [isScopeOpen, setIsScopeOpen] = useState(false);
  const { knowledgeBaseIds, setKnowledgeBaseIds, threadKey, initialMessages } = useChatStore();

  useEffect(() => {
    listKnowledgeBases().then(setKnowledgeBases).catch(console.error);
  }, []);

  // 范围按钮上的文字：全部 / 单个知识库名 / N 个知识库
  const scopeLabel =
    knowledgeBaseIds.length === 0
      ? "全部知识库"
      : knowledgeBaseIds.length === 1
        ? (knowledgeBases.find((base) => base.id === knowledgeBaseIds[0])?.name ?? "1 个知识库")
        : `${knowledgeBaseIds.length} 个知识库`;

  useEscapeKey(isScopeOpen, () => setIsScopeOpen(false));

  const toggleBase = (id: number) =>
    setKnowledgeBaseIds(knowledgeBaseIds.includes(id) ? knowledgeBaseIds.filter((item) => item !== id) : [...knowledgeBaseIds, id]);

  return (
    <div className="chat-page">
      <div className="chat-toolbar">
        <div className="scope-picker">
          <button className="library-selector" type="button" aria-haspopup="true" aria-expanded={isScopeOpen} onClick={() => setIsScopeOpen((open) => !open)}>
            <LibraryBig size={16} />
            <span>{scopeLabel}</span>
            <ChevronDown size={15} />
          </button>
          {isScopeOpen && (
            <>
              <button className="scope-backdrop" type="button" aria-label="关闭知识库范围" onClick={() => setIsScopeOpen(false)} />
              <div className="scope-menu" role="group" aria-label="知识库范围">
                <label>
                  <input type="checkbox" checked={knowledgeBaseIds.length === 0} onChange={() => setKnowledgeBaseIds([])} />
                  <span>全部知识库</span>
                </label>
                {knowledgeBases.map((base) => (
                  <label key={base.id}>
                    <input type="checkbox" checked={knowledgeBaseIds.includes(base.id)} onChange={() => toggleBase(base.id)} />
                    <span>{base.name}</span>
                  </label>
                ))}
              </div>
            </>
          )}
        </div>
        <ChatStageStatus />
      </div>
      <div className="chat-workspace">
        <section className="chat-thread-shell" aria-label="AI 对话">
          <MyRuntimeProvider key={threadKey} initialMessages={initialMessages}>
            <PendingQuestion />
            <Thread components={{ Welcome: ChatWelcome }} />
          </MyRuntimeProvider>
        </section>
      </div>
      <FeedbackDialog />
      <FeedbackNotice />
    </div>
  );
}

// 把从别处带来的问题（如文档摘要里的推荐问题）填进输入框；不自动发送，让用户确认后再发
function PendingQuestion() {
  const aui = useAui();
  const pending = useChatStore((state) => state.pendingQuestion);
  useEffect(() => {
    if (pending === null) return;
    aui.composer.setText(pending);
    useChatStore.getState().setPendingQuestion(null);
  }, [pending, aui]);
  return null;
}

// 检索 / 精排 / 生成三个阶段的状态条：让用户知道慢在哪一步，而不是只看到一个转圈
function ChatStageStatus() {
  const stage = useChatStore((state) => state.stage);
  if (!stage) return null;
  const label =
    stage.name === "retrieving"
      ? "正在检索资料…"
      : stage.name === "reranking"
        ? "正在精排候选片段…"
        : stage.hits
          ? `已找到 ${stage.hits} 个片段，正在生成回答…`
          : "知识库中没有检索到相关资料，正在生成回答…";
  return (
    <div className="chat-stage" role="status" aria-live="polite">
      <span className="chat-stage-dot" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

function ChatWelcome() {
  return (
    <div className="chat-welcome">
      <span className="chat-welcome-mark">
        <Sparkles size={21} />
      </span>
      <h2>今天想探索什么？</h2>
      <p>我可以基于你的知识库回答问题、解释概念，或帮你整理思路。</p>
      <div className="prompt-grid">
        <span>总结一篇资料的核心观点</span>
        <span>解释一个复杂概念</span>
        <span>从笔记中提炼关键要点</span>
        <span>比较两个相关的技术方案</span>
      </div>
    </div>
  );
}
