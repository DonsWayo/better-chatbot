import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const {
  getSessionMock,
  chatRepositoryMock,
  streamTextMock,
} = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  chatRepositoryMock: { upsertThread: vi.fn() },
  streamTextMock: vi.fn(),
}));

vi.mock("auth/server", () => ({ getSession: getSessionMock }));
vi.mock("lib/db/repository", () => ({ chatRepository: chatRepositoryMock }));
vi.mock("ai", () => ({
  streamText: streamTextMock,
  smoothStream: vi.fn(() => (x: unknown) => x),
}));
vi.mock("lib/ai/models", () => ({
  customModelProvider: { getModel: vi.fn(() => ({})) },
}));
vi.mock("lib/ai/prompts", () => ({
  CREATE_THREAD_TITLE_PROMPT: "Generate a concise title",
}));
vi.mock("consola/utils", () => ({ colorize: (_: string, s: string) => s }));
vi.mock("logger", () => ({
  default: { withDefaults: () => ({ info: vi.fn(), error: vi.fn() }) },
}));
vi.mock("../shared.chat", () => ({ handleError: (e: unknown) => String(e) }));

import { POST } from "./route";

const makeRequest = (body: unknown) =>
  new Request("http://localhost/api/chat/title", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });

beforeEach(() => {
  vi.clearAllMocks();
  chatRepositoryMock.upsertThread.mockResolvedValue(undefined);
});

describe("POST /api/chat/title", () => {
  it("returns 401 when no session", async () => {
    getSessionMock.mockResolvedValue(null);
    const res = await POST(makeRequest({ message: "Hello", threadId: "t-1" }));
    expect(res.status).toBe(401);
  });

  it("calls streamText when authorized and returns its response", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    const fakeResponse = new Response("stream", { status: 200 });
    streamTextMock.mockReturnValue({
      toUIMessageStreamResponse: () => fakeResponse,
    });
    const res = await POST(
      makeRequest({ message: "Hello!", threadId: "thread-1" }),
    );
    expect(streamTextMock).toHaveBeenCalled();
    expect(res.status).toBe(200);
  });

  it("passes prompt and system to streamText", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    streamTextMock.mockReturnValue({
      toUIMessageStreamResponse: () => new Response("ok"),
    });
    await POST(makeRequest({ message: "Hi there", threadId: "t-1" }));
    expect(streamTextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: "Hi there",
        system: "Generate a concise title",
      }),
    );
  });

  it("returns 500 when streamText throws", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    streamTextMock.mockImplementation(() => {
      throw new Error("Model error");
    });
    const res = await POST(makeRequest({ message: "Hi", threadId: "t-1" }));
    expect(res.status).toBe(500);
  });

  it("uses hello as default message when message is missing", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    streamTextMock.mockReturnValue({
      toUIMessageStreamResponse: () => new Response("ok"),
    });
    await POST(makeRequest({ threadId: "t-1" }));
    expect(streamTextMock).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: "hello" }),
    );
  });

  it("calls customModelProvider.getModel with chatModel from request", async () => {
    const { customModelProvider } = await import("lib/ai/models");
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    streamTextMock.mockReturnValue({
      toUIMessageStreamResponse: () => new Response("ok"),
    });
    const chatModel = { provider: "openai", model: "gpt-4.1" };
    await POST(makeRequest({ message: "Hi", threadId: "t-1", chatModel }));
    expect(customModelProvider.getModel).toHaveBeenCalledWith(chatModel);
  });

  it("passes abortSignal from request", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    streamTextMock.mockReturnValue({
      toUIMessageStreamResponse: () => new Response("ok"),
    });
    await POST(makeRequest({ message: "Hi", threadId: "t-1" }));
    expect(streamTextMock).toHaveBeenCalledWith(
      expect.objectContaining({ abortSignal: expect.anything() }),
    );
  });

  it("applies smoothStream transform to streamText call", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    streamTextMock.mockReturnValue({
      toUIMessageStreamResponse: () => new Response("ok"),
    });
    await POST(makeRequest({ message: "Hi", threadId: "t-1" }));
    expect(streamTextMock).toHaveBeenCalledWith(
      expect.objectContaining({ experimental_transform: expect.anything() }),
    );
  });

  it("returns 200 on successful generation", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    streamTextMock.mockReturnValue({
      toUIMessageStreamResponse: () => new Response("title-stream", { status: 200 }),
    });
    const res = await POST(makeRequest({ message: "What is AI?", threadId: "t-1" }));
    expect(res.status).toBe(200);
  });

  it("calls streamText exactly once per request", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    streamTextMock.mockReturnValue({ toUIMessageStreamResponse: () => new Response("ok") });
    await POST(makeRequest({ message: "Hi", threadId: "t-1" }));
    expect(streamTextMock).toHaveBeenCalledTimes(1);
  });

  it("does not call streamText when session is null", async () => {
    getSessionMock.mockResolvedValue(null);
    await POST(makeRequest({ message: "Hi", threadId: "t-1" }));
    expect(streamTextMock).not.toHaveBeenCalled();
  });

  it("calls getSession exactly once per request", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    streamTextMock.mockReturnValue({ toUIMessageStreamResponse: () => new Response("ok") });
    await POST(makeRequest({ message: "Hello", threadId: "my-thread" }));
    expect(getSessionMock).toHaveBeenCalledTimes(1);
  });
});
