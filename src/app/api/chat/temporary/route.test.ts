import { describe, it, expect, vi, beforeEach } from "vitest";

const { getSessionMock } = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
}));

vi.mock("auth/server", () => ({ getSession: getSessionMock }));
vi.mock("lib/ai/models", () => ({
  customModelProvider: { getModel: vi.fn(() => ({})) },
}));
vi.mock("lib/ai/prompts", () => ({ buildUserSystemPrompt: vi.fn(() => "") }));
vi.mock("lib/user/server", () => ({ getUserPreferences: vi.fn().mockResolvedValue(null) }));
vi.mock("logger", () => ({
  default: { withDefaults: () => ({ info: vi.fn(), error: vi.fn() }) },
}));
vi.mock("consola/utils", () => ({ colorize: (_c: string, s: string) => s }));
vi.mock("ai", () => ({
  convertToModelMessages: vi.fn(() => []),
  smoothStream: vi.fn(() => ({})),
  streamText: vi.fn(() => ({ toUIMessageStreamResponse: vi.fn(() => new Response("stream")) })),
}));

function makeRequest(body?: unknown): Request {
  return { json: () => Promise.resolve(body ?? {}) } as unknown as Request;
}

describe("POST /api/chat/temporary", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns 401 when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ messages: [] }));
    expect(res.status).toBe(401);
  });

  it("streams response when authenticated", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ messages: [], chatModel: { provider: "anthropic", model: "claude-3" } }));
    expect(res.status).toBe(200);
  });
});
