export type KnowledgeBaseDto = {
  id: number;
  name: string;
  description: string;
  documentCount: number;
  createdAt: string;
  updatedAt: string;
};

export type DocumentStatusDto = "pending" | "parsing" | "embedding" | "done" | "failed";

export type DocumentDto = {
  id: number;
  knowledgeBaseId: number;
  name: string;
  mimeType: string;
  sizeBytes: number;
  status: DocumentStatusDto;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    // 上传文件时由浏览器自动带上 multipart 边界，不能手动指定 Content-Type
    headers: init?.body instanceof FormData ? undefined : { "Content-Type": "application/json" },
    ...init,
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `请求失败（${response.status}）`);
  }
  return (response.status === 204 ? undefined : response.json()) as Promise<T>;
}

export const listKnowledgeBases = () => request<KnowledgeBaseDto[]>("/knowledge-bases");

export const createKnowledgeBase = (input: { name: string; description?: string }) =>
  request<KnowledgeBaseDto>("/knowledge-bases", { method: "POST", body: JSON.stringify(input) });

export const listDocuments = (knowledgeBaseId: number) =>
  request<DocumentDto[]>(`/knowledge-bases/${knowledgeBaseId}/documents`);

export const uploadDocument = (knowledgeBaseId: number, file: File) => {
  const body = new FormData();
  body.append("file", file);
  return request<DocumentDto>(`/knowledge-bases/${knowledgeBaseId}/documents`, { method: "POST", body });
};

export const deleteDocument = (id: number) => request<void>(`/documents/${id}`, { method: "DELETE" });

export type ChatSource = {
  index: number;
  chunkId: number;
  documentId: number;
  documentName: string;
  page: number | null;
  content: string;
  score: number;
};

export type ChatEvent =
  | { type: "conversation"; id: number }
  | { type: "sources"; sources: ChatSource[] }
  | { type: "delta"; text: string }
  | { type: "followups"; items: string[] }
  | { type: "done" }
  | { type: "error"; message: string };

// 读取问答接口的 SSE 流，逐个产出事件
export async function* streamChat(
  messages: { role: "user" | "assistant"; content: string }[],
  knowledgeBaseIds: number[],
  conversationId: number | null,
  signal: AbortSignal,
): AsyncGenerator<ChatEvent> {
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, knowledgeBaseIds, conversationId }),
    signal,
  });
  if (!response.ok || !response.body) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `请求失败（${response.status}）`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    // 事件之间以空行分隔
    for (let end = buffer.indexOf("\n\n"); end >= 0; end = buffer.indexOf("\n\n")) {
      const block = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      if (block.startsWith("data:")) yield JSON.parse(block.slice(5).trim()) as ChatEvent;
    }
  }
}

export type ConversationDto = {
  id: number;
  title: string;
  // 检索范围，空数组表示全部知识库
  knowledgeBaseIds: number[];
  isFavorite: boolean;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ConversationDetailDto = ConversationDto & {
  messages: { id: number; role: "user" | "assistant"; content: string; citations: ChatSource[] | null }[];
};

export const listConversations = (query = "", archived = false) =>
  request<ConversationDto[]>(`/conversations?${new URLSearchParams({ ...(query ? { q: query } : {}), ...(archived ? { archived: "1" } : {}) })}`);

export const updateConversation = (id: number, patch: { title?: string; isFavorite?: boolean; archived?: boolean }) =>
  request<ConversationDto>(`/conversations/${id}`, { method: "PATCH", body: JSON.stringify(patch) });

export const getConversation = (id: number) => request<ConversationDetailDto>(`/conversations/${id}`);

export const summarizeConversation = (id: number) =>
  request<{ summary: string }>(`/conversations/${id}/summary`, { method: "POST" });

export const deleteConversation = (id: number) => request<void>(`/conversations/${id}`, { method: "DELETE" });

export type DocumentChunkDto = { id: number; chunkIndex: number; content: string; page: number | null };

export const getDocumentChunks = (id: number) =>
  request<{ document: DocumentDto; chunks: DocumentChunkDto[] }>(`/documents/${id}/chunks`);

export type ActivityType = "kb_created" | "doc_uploaded" | "doc_ready" | "doc_failed" | "conversation_started";

export type ActivityDto = { id: number; type: ActivityType; title: string; refId: number | null; createdAt: string };

export type OverviewDto = {
  knowledgeBases: number;
  documents: number;
  conversations: number;
  // 需要处理：失败或仍在处理中的文档
  attention: { id: number; name: string; knowledgeBaseId: number; status: DocumentStatusDto; errorMessage: string | null }[];
};

export const getOverview = () => request<OverviewDto>("/overview");

export const listActivities = (before?: number) =>
  request<ActivityDto[]>(`/activities?limit=30${before ? `&before=${before}` : ""}`);

export const retryDocument = (id: number) => request<DocumentDto>(`/documents/${id}/retry`, { method: "POST" });

export const renameDocument = (id: number, name: string) =>
  request<DocumentDto>(`/documents/${id}`, { method: "PATCH", body: JSON.stringify({ name }) });

export type NoteListItemDto = {
  id: number;
  title: string;
  preview: string;
  category: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
};

export type NoteSourceInput = { type: "document" | "conversation"; refId: number; chunkId?: number; label: string };

// available 为 false 表示来源资源已被删除，只保留名称
export type NoteSourceDto = Omit<NoteSourceInput, "chunkId"> & { id: number; chunkId: number | null; available: boolean };

export type NoteDto = Omit<NoteListItemDto, "preview"> & { content: string; sources: NoteSourceDto[] };

export const listNotes = (query = "", tag = "") =>
  request<NoteListItemDto[]>(`/notes?${new URLSearchParams({ ...(query ? { q: query } : {}), ...(tag ? { tag } : {}) })}`);

export const listNotesBySource = (type: "document" | "conversation", refId: number) =>
  request<NoteListItemDto[]>(`/notes?${new URLSearchParams({ sourceType: type, refId: String(refId) })}`);

export const listNoteTags = () => request<{ tag: string; count: number }[]>("/notes/tags");

export const getNote = (id: number) => request<NoteDto>(`/notes/${id}`);

export const createNote = (input: { title?: string; content?: string; sources?: NoteSourceInput[] } = {}) =>
  request<NoteDto>("/notes", { method: "POST", body: JSON.stringify(input) });

export type NotePatch = { title?: string; content?: string; category?: string; tags?: string[] };

export const updateNote = (id: number, patch: NotePatch) =>
  request<NoteDto>(`/notes/${id}`, { method: "PATCH", body: JSON.stringify(patch) });

export const deleteNote = (id: number) => request<void>(`/notes/${id}`, { method: "DELETE" });

export type NoteAiAction = "summary" | "outline" | "keywords" | "explain" | "rewrite" | "polish";

// 只返回候选内容，不会修改笔记
export const runNoteAi = (action: NoteAiAction, text: string) =>
  request<{ result: string }>("/notes/ai", { method: "POST", body: JSON.stringify({ action, text }) });
