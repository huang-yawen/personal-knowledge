import { beforeEach, expect, test, vi } from "vitest";

// api 模块里都是网络调用，测试只关心 store 的状态流转，所以整体替换掉。
// 用 vi.fn() 在工厂里创建，避免引用外部变量时踩到 ESM 提升的暂时性死区
vi.mock("@/lib/api", () => ({
  getConversation: vi.fn(),
  listConversations: vi.fn(),
  updateConversation: vi.fn(),
  deleteConversation: vi.fn(),
}));

const api = await import("@/lib/api");
const { useChatStore } = await import("@/lib/chat-store");

const getConversation = vi.mocked(api.getConversation);
const listConversations = vi.mocked(api.listConversations);
const deleteConversation = vi.mocked(api.deleteConversation);

const source = {
  index: 1,
  chunkId: 183,
  documentId: 133,
  documentName: "笔记.md",
  page: null,
  content: "片段正文",
  score: 0.71,
};

const base = {
  id: 7,
  title: "测试对话",
  knowledgeBaseIds: [16, 17],
  isFavorite: false,
  archived: false,
  createdAt: "2026-11-20T00:00:00.000Z",
  updatedAt: "2026-11-20T00:00:00.000Z",
};

// 正常结束的对话：最后一条助手消息带引用
const completeDetail = {
  ...base,
  messages: [
    { id: 1, role: "user" as const, content: "问题", citations: null, incomplete: false },
    { id: 2, role: "assistant" as const, content: "完整回答", citations: [source], incomplete: false },
  ],
};

// 最后一条是被用户停止的回答：没有引用，且标记为不完整
const stoppedDetail = {
  ...base,
  messages: [
    { id: 1, role: "user" as const, content: "问题", citations: null, incomplete: false },
    { id: 2, role: "assistant" as const, content: "完整回答", citations: [source], incomplete: false },
    { id: 3, role: "assistant" as const, content: "被停止的半截回答", citations: null, incomplete: true },
  ],
};

beforeEach(() => {
  getConversation.mockReset();
  listConversations.mockReset().mockResolvedValue([]);
  deleteConversation.mockReset().mockResolvedValue(undefined);
  useChatStore.setState({
    knowledgeBaseIds: [],
    sources: [],
    stage: null,
    conversations: [],
    conversationQuery: "",
    showArchived: false,
    conversationId: null,
    threadKey: 0,
    initialMessages: [],
    pendingQuestion: null,
  });
});

test("打开对话时载入消息、检索范围和引用来源", async () => {
  getConversation.mockResolvedValue(completeDetail);
  await useChatStore.getState().openConversation(7);

  const state = useChatStore.getState();
  expect(state.conversationId).toBe(7);
  expect(state.knowledgeBaseIds).toEqual([16, 17]);
  // 右侧来源取最后一条助手消息的引用
  expect(state.sources).toEqual([source]);
  expect(state.initialMessages).toHaveLength(2);
  expect(state.threadKey).toBe(1);
});

test("消息的引用写进 metadata，用户消息不需要 metadata", async () => {
  getConversation.mockResolvedValue(completeDetail);
  await useChatStore.getState().openConversation(7);

  const [user, assistant] = useChatStore.getState().initialMessages;
  expect(user.metadata).toBeUndefined();
  expect(assistant.metadata).toEqual({ custom: { messageId: 2, sources: [source], incomplete: false } });
});

test("被停止的回答带上 incomplete 标记，暂停后刷新仍能提示内容不完整", async () => {
  getConversation.mockResolvedValue(stoppedDetail);
  await useChatStore.getState().openConversation(7);

  const state = useChatStore.getState();
  expect(state.initialMessages).toHaveLength(3);
  expect(state.initialMessages[2].metadata).toEqual({ custom: { messageId: 3, sources: [], incomplete: true } });
  // 最后一条没有引用，所以来源面板为空——这是预期行为
  expect(state.sources).toEqual([]);
});

test("新建对话会清空状态并换掉运行时 key", async () => {
  getConversation.mockResolvedValue(completeDetail);
  await useChatStore.getState().openConversation(7);
  const before = useChatStore.getState().threadKey;

  useChatStore.getState().newConversation();
  const state = useChatStore.getState();
  expect(state.conversationId).toBeNull();
  expect(state.initialMessages).toEqual([]);
  expect(state.sources).toEqual([]);
  expect(state.threadKey).toBe(before + 1);
});

test("阶段状态在新建和切换对话时都会清空", async () => {
  useChatStore.getState().setStage({ name: "retrieving" });
  useChatStore.getState().newConversation();
  expect(useChatStore.getState().stage).toBeNull();

  getConversation.mockResolvedValue(completeDetail);
  useChatStore.getState().setStage({ name: "generating", hits: 3 });
  await useChatStore.getState().openConversation(7);
  expect(useChatStore.getState().stage).toBeNull();
});

test("删除当前打开的对话后回到新对话并刷新列表", async () => {
  getConversation.mockResolvedValue(completeDetail);
  await useChatStore.getState().openConversation(7);

  await useChatStore.getState().removeConversation(7);
  expect(deleteConversation).toHaveBeenCalledWith(7);
  expect(useChatStore.getState().conversationId).toBeNull();
  expect(listConversations).toHaveBeenCalled();
});

test("删除别的对话不会影响当前打开的那个", async () => {
  getConversation.mockResolvedValue(completeDetail);
  await useChatStore.getState().openConversation(7);

  await useChatStore.getState().removeConversation(99);
  expect(useChatStore.getState().conversationId).toBe(7);
});
