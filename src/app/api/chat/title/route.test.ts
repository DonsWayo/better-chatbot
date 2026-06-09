import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  getSessionMock,
  getModelMock,
  upsertThreadMock,
  streamTextMock,
  handleErrorMock,
} = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  getModelMock: vi.fn(() => ({})),
  upsertThreadMock: vi.fn().mockResolvedValue({}),
  streamTextMock: vi.fn(() => ({
    toUIMessageStreamResponse: vi.fn(() => new Response("stream")),
  })),
  handleErrorMock: vi.fn((e: any) => String(e)),
}));

vi.mock("auth/server", () => ({ getSession: getSessionMock }));
vi.mock("lib/ai/models", () => ({
  customModelProvider: { getModel: getModelMock },
}));
vi.mock("lib/ai/prompts", () => ({ CREATE_THREAD_TITLE_PROMPT: "Generate a title:" }));
vi.mock("logger", () => ({
  default: { withDefaults: () => ({ info: vi.fn(), error: vi.fn() }) },
}));
vi.mock("consola/utils", () => ({ colorize: (_c: string, s: string) => s }));
vi.mock("lib/db/repository", () => ({
  chatRepository: { upsertThread: upsertThreadMock },
}));
vi.mock("../shared.chat", () => ({ handleError: handleErrorMock }));
vi.mock("ai", () => ({
  smoothStream: vi.fn(() => ({})),
  streamText: streamTextMock,
}));

function makeRequest(body?: unknown): Request {
  return {
    json: () => Promise.resolve(body ?? {}),
    signal: new AbortController().signal,
  } as unknown as Request;
}

describe("POST /api/chat/title", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns 401 when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ message: "hi", threadId: "t1" }));
    expect(res.status).toBe(401);
  });

  it("never calls getModel when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    await POST(makeRequest({ message: "hi", threadId: "t1" }));
    expect(getModelMock).not.toHaveBeenCalled();
  });

  it("streams title response when authenticated", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    streamTextMock.mockReturnValueOnce({
      toUIMessageStreamResponse: vi.fn(() => new Response("stream")),
    });
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ message: "Discuss AI safety", threadId: "thread-1" }));
    expect(res.status).toBe(200);
  });

  it("passes chatModel to getModel", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    const chatModel = { provider: "openai", model: "gpt-4o" };
    streamTextMock.mockReturnValueOnce({
      toUIMessageStreamResponse: vi.fn(() => new Response("ok")),
    });
    const { POST } = await import("./route");
    await POST(makeRequest({ message: "hello", threadId: "t1", chatModel }));
    expect(getModelMock).toHaveBeenCalledWith(chatModel);
  });

  it("returns 500 when streamText throws", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    streamTextMock.mockImplementationOnce(() => {
      throw new Error("stream failure");
    });
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ message: "hello", threadId: "t1" }));
    expect(res.status).toBe(500);
  });

  it("calls streamText with the message as the prompt", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    let capturedPrompt = "";
    streamTextMock.mockImplementationOnce((opts: any) => {
      capturedPrompt = opts.prompt ?? "";
      return { toUIMessageStreamResponse: vi.fn(() => new Response("ok")) };
    });
    const { POST } = await import("./route");
    await POST(makeRequest({ message: "Why is the sky blue?", threadId: "t1" }));
    expect(capturedPrompt).toBe("Why is the sky blue?");
  });

  it("401 body is text 'Unauthorized'", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ message: "hi", threadId: "t1" }));
    expect(res.status).toBe(401);
    const text = await res.text();
    expect(text).toBe("Unauthorized");
  });

  it("never calls streamText when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    await POST(makeRequest({ message: "hi", threadId: "t1" }));
    expect(streamTextMock).not.toHaveBeenCalled();
  });

  it("streamText called exactly once per request", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    streamTextMock.mockReturnValueOnce({
      toUIMessageStreamResponse: vi.fn(() => new Response("ok")),
    });
    const { POST } = await import("./route");
    await POST(makeRequest({ message: "hello", threadId: "t1" }));
    expect(streamTextMock).toHaveBeenCalledTimes(1);
  });

  it("getSession called exactly once per POST", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    await POST(makeRequest({ message: "hi", threadId: "t1" }));
    expect(getSessionMock).toHaveBeenCalledTimes(1);
  });

  it("never calls upsertThread when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    await POST(makeRequest({ message: "hi", threadId: "t1" }));
    expect(upsertThreadMock).not.toHaveBeenCalled();
  });
});
