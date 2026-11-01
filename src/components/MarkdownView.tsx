import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// 笔记预览与 AI 候选内容共用的 Markdown 渲染：支持表格、代码块、任务列表、链接、图片
export function MarkdownView({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        // 外链在新标签页打开
        a: ({ node: _node, ...props }) => <a {...props} target="_blank" rel="noreferrer noopener" />,
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
