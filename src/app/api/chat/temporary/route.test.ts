import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  getSessionMock,
  getModelMock,
  buildUserSystemPromptMock,
  getUserPreferencesMock,
  convertToModelMessagesMock,
  streamTextMock,
} = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  getModelMock: vi.fn(() => ({})),
  buildUserSystemPromptMock: vi.fn(() => "system-prompt"),
  getUserPreferencesMock: vi.fn().mockResolvedValue(null),
  convertToModelMessagesMock: vi.fn(() => []),
  streamTextMock: vi.fn(() => ({
    toUIMessageStreamResponse: vi.fn(() => new Response("stream")),
  })),
}));

vi.mock("auth/server", () => ({ getSession: getSessionMock }));
vi.mock("lib/ai/models", () => ({
  customModelProvider: { getModel: getModelMock },
}));
vi.mock("lib/ai/prompts", () => ({ buildUserSystemPrompt: buildUserSystemPromptMock }));
vi.mock("lib/user/server", () => ({ getUserPreferences: getUserPreferencesMock }));
vi.mock("logger", () => ({
  default: { withDefaults: () => ({ info: vi.fn(), error: vi.fn() }) },
}));
vi.mock("consola/utils", () => ({ colorize: (_c: string, s: string) => s }));
vi.mock("ai", () => ({
  convertToModelMessages: convertToModelMessagesMock,
  smoothStream: vi.fn(() => ({})),
  streamText: streamTextMock,
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

  it("never calls getModel when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    await POST(makeRequest({ messages: [] }));
    expect(getModelMock).not.toHaveBeenCalled();
  });

  it("streams response when authenticated", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    streamTextMock.mockReturnValueOnce({
      toUIMessageStreamResponse: vi.fn(() => new Response("stream")),
    });
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ messages: [], chatModel: { provider: "anthropic", model: "claude-3" } }));
    expect(res.status).toBe(200);
  });

  it("passes chatModel to getModel", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    const chatModel = { provider: "openai", model: "gpt-4" };
    streamTextMock.mockReturnValueOnce({
      toUIMessageStreamResponse: vi.fn(() => new Response("ok")),
    });
    const { POST } = await import("./route");
    await POST(makeRequest({ messages: [], chatModel }));
    expect(getModelMock).toHaveBeenCalledWith(chatModel);
  });

  it("calls getUserPreferences with the userId from session", async () => {
    const userId = "user-xyz-789";
    getSessionMock.mockResolvedValue({ user: { id: userId } });
    streamTextMock.mockReturnValueOnce({
      toUIMessageStreamResponse: vi.fn(() => new Response("ok")),
    });
    const { POST } = await import("./route");
    await POST(makeRequest({ messages: [] }));
    expect(getUserPreferencesMock).toHaveBeenCalledWith(userId);
  });

  it("returns 500 when streamText throws", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    streamTextMock.mockImplementationOnce(() => {
      throw new Error("model error");
    });
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ messages: [] }));
    expect(res.status).toBe(500);
  });

  it("includes instructions in system prompt when provided", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    buildUserSystemPromptMock.mockReturnValueOnce("user-prompt");
    let capturedSystem = "";
    streamTextMock.mockImplementationOnce((opts: any) => {
      capturedSystem = opts.system ?? "";
      return { toUIMessageStreamResponse: vi.fn(() => new Response("ok")) };
    });
    const { POST } = await import("./route");
    await POST(makeRequest({ messages: [], instructions: "be concise" }));
    expect(capturedSystem).toContain("be concise");
  });
});
