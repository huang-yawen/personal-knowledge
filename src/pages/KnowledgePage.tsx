import { useState } from "react";
import { ChevronRight, CheckCircle2, CircleAlert, FileUp, LibraryBig, MoreHorizontal, Plus, Search, Settings2, Sparkles, Upload, X } from "lucide-react";
import { initialKnowledgeBases } from "@/mock/data";
import type { KnowledgeBase, KnowledgeDocument } from "@/types";

export function KnowledgePage() {
  const [knowledgeBases, setKnowledgeBases] = useState(initialKnowledgeBases);
  const [selectedId, setSelectedId] = useState(1);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const selectedBase = knowledgeBases.find((item) => item.id === selectedId) ?? knowledgeBases[0];

  const createKnowledgeBase = () => {
    const name = newName.trim();
    if (!name) return;
    const id = Math.max(...knowledgeBases.map((item) => item.id), 0) + 1;
    const next: KnowledgeBase = { id, name, description: newDescription.trim() || "尚未添加描述", documents: 0, updated: "刚刚创建", cover: "blue", items: [] };
    setKnowledgeBases((items) => [next, ...items]);
    setSelectedId(id);
    setNewName("");
    setNewDescription("");
    setIsCreateOpen(false);
  };

  const addDocument = (file: File) => {
    const fileType = file.name.split(".").pop()?.toUpperCase() ?? "文件";
    const newDocument: KnowledgeDocument = { name: file.name, type: fileType, size: `${Math.max(file.size / 1024 / 1024, 0.1).toFixed(1)} MB`, updated: "刚刚上传", status: "等待处理" };
    const updateStatus = (status: KnowledgeDocument["status"]) => setKnowledgeBases((items) => items.map((base) => base.id !== selectedBase.id ? base : { ...base, updated: "刚刚更新", items: base.items.map((document) => document.name === file.name ? { ...document, status } : document) }));
    setKnowledgeBases((items) => items.map((base) => base.id !== selectedBase.id ? base : { ...base, updated: "刚刚更新", documents: base.documents + 1, items: [newDocument, ...base.items] }));
    window.setTimeout(() => updateStatus("处理中"), 700);
    window.setTimeout(() => updateStatus("完成"), 2300);
  };

  return (
    <div className="knowledge-page">
      <div className="knowledge-page-head">
        <div><p className="eyebrow">个人资料空间</p><h2>我的知识库</h2><p>将资料沉淀为可检索、可连接的长期知识资产。</p></div>
        <button className="knowledge-create" type="button" onClick={() => setIsCreateOpen(true)}><Plus size={17} /> 创建知识库</button>
      </div>
      <div className="knowledge-layout">
        <section className="knowledge-list-section">
          <div className="knowledge-list-tools"><div className="knowledge-search"><Search size={16} /><span>搜索知识库</span></div><button type="button" aria-label="筛选知识库"><Settings2 size={16} /></button></div>
          <div className="knowledge-card-list">
            {knowledgeBases.map((base) => <button key={base.id} type="button" className={`knowledge-card${base.id === selectedBase.id ? " selected" : ""}`} onClick={() => setSelectedId(base.id)}><span className={`knowledge-cover ${base.cover}`}><LibraryBig size={20} /></span><span className="knowledge-card-copy"><strong>{base.name}</strong><small>{base.documents} 份资料 · {base.updated}</small></span><ChevronRight size={17} /></button>)}
          </div>
        </section>

        <section className="knowledge-detail-section">
          <header className="knowledge-detail-head"><div className="knowledge-detail-title"><span className={`knowledge-cover large ${selectedBase.cover}`}><LibraryBig size={23} /></span><div><h3>{selectedBase.name}</h3><p>{selectedBase.description}</p></div></div><button type="button" className="detail-more" aria-label="知识库更多选项"><MoreHorizontal size={19} /></button></header>
          <div className="document-toolbar"><div><strong>资料</strong><span>{selectedBase.documents} 个文档</span></div><label className="upload-button"><FileUp size={16} /> 上传资料<input type="file" accept=".pdf,.txt,.md,text/plain,application/pdf,text/markdown" onChange={(event) => { const file = event.target.files?.[0]; if (file) addDocument(file); event.currentTarget.value = ""; }} /></label></div>
          {selectedBase.items.length > 0 ? <div className="document-list">{selectedBase.items.map((document) => <article className="document-row" key={`${document.name}-${document.updated}`}><span className={`file-type ${document.type.toLowerCase()}`}>{document.type}</span><div className="document-copy"><strong>{document.name}</strong><small>{document.size} · 更新于 {document.updated}</small></div><DocumentStatus status={document.status} /><button type="button" className="document-more" aria-label={`${document.name} 更多操作`}><MoreHorizontal size={18} /></button></article>)}</div> : <div className="documents-empty"><span><Upload size={21} /></span><h3>还没有资料</h3><p>上传 PDF、Markdown 或 TXT 文件，开始构建可检索的知识库。</p><label className="upload-button secondary"><FileUp size={16} /> 上传第一份资料<input type="file" accept=".pdf,.txt,.md,text/plain,application/pdf,text/markdown" onChange={(event) => { const file = event.target.files?.[0]; if (file) addDocument(file); event.currentTarget.value = ""; }} /></label></div>}
          <div className="processing-note"><Sparkles size={15} /><span>文件上传后会自动解析、分段并建立检索索引。处理完成后即可用于 AI 对话。</span></div>
        </section>
      </div>

      {isCreateOpen && <div className="create-modal-layer" role="presentation"><button className="modal-backdrop" type="button" aria-label="关闭创建知识库弹窗" onClick={() => setIsCreateOpen(false)} /><section className="create-modal" role="dialog" aria-modal="true" aria-labelledby="create-library-title"><button className="modal-close" type="button" aria-label="关闭" onClick={() => setIsCreateOpen(false)}><X size={18} /></button><span className="modal-mark"><LibraryBig size={20} /></span><h3 id="create-library-title">创建知识库</h3><p>为一组相关资料建立专属空间，之后可以在 AI 对话中选择它。</p><label>知识库名称<input autoFocus value={newName} placeholder="例如：机器学习" onChange={(event) => setNewName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") createKnowledgeBase(); }} /></label><label>描述（可选）<textarea value={newDescription} placeholder="简单描述这个知识库的用途" onChange={(event) => setNewDescription(event.target.value)} /></label><div className="modal-actions"><button type="button" onClick={() => setIsCreateOpen(false)}>取消</button><button type="button" className="modal-primary" onClick={createKnowledgeBase} disabled={!newName.trim()}>创建知识库</button></div></section></div>}
    </div>
  );
}

function DocumentStatus({ status }: { status: KnowledgeDocument["status"] }) {
  const icon = status === "完成" ? <CheckCircle2 size={15} /> : status === "处理失败" ? <CircleAlert size={15} /> : <span className="status-spinner" />;
  return <span className={`document-status ${status === "完成" ? "done" : status === "处理失败" ? "failed" : "pending"}`}>{icon}{status}</span>;
}
