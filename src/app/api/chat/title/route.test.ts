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
});
