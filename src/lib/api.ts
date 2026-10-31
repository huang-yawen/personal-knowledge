export type KnowledgeBaseDto = {
  id: number;
  name: string;
  description: string;
  documentCount: number;
  createdAt: string;
  updatedAt: string;
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `请求失败（${response.status}）`);
  }
  return response.json() as Promise<T>;
}

export const listKnowledgeBases = () => request<KnowledgeBaseDto[]>("/knowledge-bases");

export const createKnowledgeBase = (input: { name: string; description?: string }) =>
  request<KnowledgeBaseDto>("/knowledge-bases", { method: "POST", body: JSON.stringify(input) });
