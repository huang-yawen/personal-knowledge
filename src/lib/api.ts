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
