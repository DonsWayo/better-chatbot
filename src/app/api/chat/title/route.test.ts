import { describe, it, expect, vi, beforeEach } from "vitest";

const { getSessionMock } = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
}));

vi.mock("auth/server", () => ({ getSession: getSessionMock }));
vi.mock("lib/ai/models", () => ({
  customModelProvider: { getModel: vi.fn(() => ({})) },
}));
vi.mock("lib/ai/prompts", () => ({ CREATE_THREAD_TITLE_PROMPT: "Generate a title:" }));
vi.mock("logger", () => ({
  default: { withDefaults: () => ({ info: vi.fn(), error: vi.fn() }) },
}));
vi.mock("consola/utils", () => ({ colorize: (_c: string, s: string) => s }));
vi.mock("lib/db/repository", () => ({
  chatRepository: { upsertThread: vi.fn().mockResolvedValue({}) },
}));
vi.mock("../shared.chat", () => ({ handleError: vi.fn((e: any) => String(e)) }));
vi.mock("ai", () => ({
  smoothStream: vi.fn(() => ({})),
  streamText: vi.fn(() => ({ toUIMessageStreamResponse: vi.fn(() => new Response("stream")) })),
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

  it("streams title response when authenticated", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ message: "Discuss AI safety", threadId: "thread-1" }));
    expect(res.status).toBe(200);
  });
});
