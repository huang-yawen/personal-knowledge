import { afterEach, expect, test, vi } from "vitest";
import { streamChat, type ChatEvent } from "@/lib/api";

const encoder = new TextEncoder();

// 把任意文本包装成一个可读流，顺便覆盖事件被拆到两个网络分片的情况
const streamOf = (chunks: string[]) =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });

afterEach(() => {
  vi.unstubAllGlobals();
});

test("解析阶段事件，忽略心跳注释，并正确处理跨分片的事件", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(
        streamOf([
          'data: {"type":"stage","stage":"retrieving"}\n\n',
          ": ping\n\n",
          // 事件被拆成两个分片，解析器必须先缓冲再拼
          'data: {"type":"stage","stage":"gene',
          'rating","hits":3}\n\n',
          'data: {"type":"delta","text":"你好"}\n\n',
          'data: {"type":"saved","messageId":42}\n\n',
          'data: {"type":"done"}\n\n',
        ]),
        { status: 200 },
      ),
    ),
  );

  const events: ChatEvent[] = [];
  for await (const event of streamChat([{ role: "user", content: "问题" }], [], null, new AbortController().signal)) {
    events.push(event);
  }

  expect(events).toEqual([
    { type: "stage", stage: "retrieving" },
    { type: "stage", stage: "generating", hits: 3 },
    { type: "delta", text: "你好" },
    { type: "saved", messageId: 42 },
    { type: "done" },
  ]);
});
