import { useEffect, useState } from "react";
import { LibraryBig, Sparkles } from "lucide-react";
import { Thread } from "@/components/assistant-ui/elements/thread.aui";
import { listKnowledgeBases, type KnowledgeBaseDto } from "@/lib/api";
import { useChatStore } from "@/lib/chat-store";
import { MyRuntimeProvider } from "@/MyRuntimeProvider";

export function ChatPage() {
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBaseDto[]>([]);
  const { knowledgeBaseId, setKnowledgeBaseId, threadKey, initialMessages } = useChatStore();

  useEffect(() => {
    listKnowledgeBases().then(setKnowledgeBases).catch(console.error);
  }, []);

  return (
    <div className="chat-page">
      <div className="chat-toolbar">
        <label className="library-selector">
          <LibraryBig size={16} />
          <select
            aria-label="知识库范围"
            value={knowledgeBaseId ?? ""}
            onChange={(event) => setKnowledgeBaseId(event.target.value ? Number(event.target.value) : null)}
          >
            <option value="">全部知识库</option>
            {knowledgeBases.map((base) => (
              <option key={base.id} value={base.id}>
                {base.name}
              </option>
            ))}
          </select>
        </label>
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
