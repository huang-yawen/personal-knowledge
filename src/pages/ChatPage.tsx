import { useEffect, useState } from "react";
import { ChevronDown, LibraryBig, Sparkles } from "lucide-react";
import { Thread } from "@/components/assistant-ui/elements/thread.aui";
import { listKnowledgeBases, type KnowledgeBaseDto } from "@/lib/api";
import { useChatStore } from "@/lib/chat-store";
import { MyRuntimeProvider } from "@/MyRuntimeProvider";

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
      </div>
      <div className="chat-workspace">
        <section className="chat-thread-shell" aria-label="AI 对话">
          <MyRuntimeProvider key={threadKey} initialMessages={initialMessages}>
            <Thread components={{ Welcome: ChatWelcome }} />
          </MyRuntimeProvider>
        </section>
      </div>
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
