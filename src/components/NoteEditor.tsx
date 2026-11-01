import CodeMirror, { EditorView, Prec, keymap } from "@uiw/react-codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags } from "@lezer/highlight";

// 语法高亮只用字重、斜体和项目已有的颜色变量，浅色/深色主题下都不会出现刺眼的配色
const highlightStyle = HighlightStyle.define([
  { tag: tags.heading, fontWeight: "600" },
  { tag: tags.strong, fontWeight: "600" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.strikethrough, textDecoration: "line-through" },
  { tag: tags.monospace, fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" },
  { tag: [tags.link, tags.url], color: "var(--blue)" },
  { tag: tags.quote, color: "var(--muted)" },
  { tag: tags.processingInstruction, color: "var(--muted)" },
]);

const editorTheme = EditorView.theme({
  "&": { height: "100%", backgroundColor: "transparent", color: "var(--text)", fontSize: "15px" },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": { fontFamily: "inherit", lineHeight: "1.8" },
  ".cm-content": { width: "min(760px, 100%)", margin: "0 auto", padding: "16px 24px 64px", caretColor: "var(--text)" },
  ".cm-cursor": { borderLeftColor: "var(--text)" },
  "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground": { background: "var(--blue-soft)" },
  ".cm-selectionBackground": { background: "var(--blue-soft)" },
  ".cm-placeholder": { color: "var(--muted)" },
});

type Props = {
  value: string;
  onChange: (value: string) => void;
  // 选区变化（从、到的字符位置）
  onSelect: (from: number, to: number) => void;
  // 编辑器创建后回调，工具栏据此直接操作文档
  onReady: (view: EditorView) => void;
  onBold: () => void;
};

// 笔记的 Markdown 编辑区（CodeMirror 6）：语法高亮、列表自动续行、自动换行，Ctrl/Cmd+B 加粗
export function NoteEditor({ value, onChange, onSelect, onReady, onBold }: Props) {
  return (
    <CodeMirror
      className="note-cm"
      value={value}
      height="100%"
      theme="none"
      placeholder="开始记录你的想法…"
      basicSetup={{ lineNumbers: false, foldGutter: false, highlightActiveLine: false, highlightActiveLineGutter: false, syntaxHighlighting: false }}
      extensions={[
        markdown(),
        EditorView.lineWrapping,
        editorTheme,
        syntaxHighlighting(highlightStyle),
        Prec.highest(
          keymap.of([
            {
              key: "Mod-b",
              run: () => {
                onBold();
                return true;
              },
            },
          ]),
        ),
      ]}
      onChange={onChange}
      onCreateEditor={onReady}
      onUpdate={(update) => {
        if (update.selectionSet) {
          const { from, to } = update.state.selection.main;
          onSelect(from, to);
        }
      }}
    />
  );
}
