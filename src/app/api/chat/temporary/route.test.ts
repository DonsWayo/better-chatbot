import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const {
  getSessionMock,
  streamTextMock,
  getUserPreferencesMock,
} = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  streamTextMock: vi.fn(),
  getUserPreferencesMock: vi.fn(),
}));

vi.mock("auth/server", () => ({ getSession: getSessionMock }));
vi.mock("ai", () => ({
  streamText: streamTextMock,
  smoothStream: vi.fn(() => (x: unknown) => x),
  convertToModelMessages: vi.fn((m: unknown) => m),
}));
vi.mock("lib/ai/models", () => ({
  customModelProvider: { getModel: vi.fn(() => ({})) },
}));
vi.mock("lib/ai/prompts", () => ({
  buildUserSystemPrompt: vi.fn(() => "System prompt"),
}));
vi.mock("lib/user/server", () => ({
  getUserPreferences: getUserPreferencesMock,
}));
vi.mock("consola/utils", () => ({ colorize: (_: string, s: string) => s }));
vi.mock("logger", () => ({
  default: { withDefaults: () => ({ info: vi.fn(), error: vi.fn() }) },
}));

import { POST } from "./route";

const makeRequest = (body: unknown) =>
  new Request("http://localhost/api/chat/temporary", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });

const MESSAGES = [{ role: "user", content: "Hello" }];

beforeEach(() => {
  vi.clearAllMocks();
  getUserPreferencesMock.mockResolvedValue(null);
  streamTextMock.mockReturnValue({
    toUIMessageStreamResponse: () => new Response("stream", { status: 200 }),
  });
});

describe("POST /api/chat/temporary", () => {
  it("returns 401 when no session", async () => {
    getSessionMock.mockResolvedValue(null);
    const res = await POST(makeRequest({ messages: MESSAGES }));
    expect(res.status).toBe(401);
  });

  it("returns 200 and streaming response when authorized", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    const res = await POST(makeRequest({ messages: MESSAGES }));
    expect(res.status).toBe(200);
    expect(streamTextMock).toHaveBeenCalled();
  });

  it("calls streamText with messages", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    await POST(makeRequest({ messages: MESSAGES }));
    expect(streamTextMock).toHaveBeenCalledWith(
      expect.objectContaining({ messages: MESSAGES }),
    );
  });

  it("appends instructions to system prompt when provided", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    await POST(makeRequest({ messages: MESSAGES, instructions: "Be concise" }));
    expect(streamTextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        system: expect.stringContaining("Be concise"),
      }),
    );
  });

  it("does not include empty instructions in system prompt", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    await POST(makeRequest({ messages: MESSAGES }));
    const call = streamTextMock.mock.calls[0][0];
    expect(call.system).toBe("System prompt");
  });

  it("returns 500 when streamText throws", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    streamTextMock.mockImplementation(() => {
      throw new Error("Model error");
    });
    const res = await POST(makeRequest({ messages: MESSAGES }));
    expect(res.status).toBe(500);
  });

  it("fetches user preferences with session user id", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-42" } });
    await POST(makeRequest({ messages: MESSAGES }));
    expect(getUserPreferencesMock).toHaveBeenCalledWith("user-42");
  });

  it("calls getUserPreferences exactly once", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    await POST(makeRequest({ messages: MESSAGES }));
    expect(getUserPreferencesMock).toHaveBeenCalledTimes(1);
  });

  it("calls streamText exactly once per request", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    await POST(makeRequest({ messages: MESSAGES }));
    expect(streamTextMock).toHaveBeenCalledTimes(1);
  });

  it("does not call streamText when session is null", async () => {
    getSessionMock.mockResolvedValue(null);
    await POST(makeRequest({ messages: MESSAGES }));
    expect(streamTextMock).not.toHaveBeenCalled();
  });

  it("passes chatModel to streamText when provided", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    const chatModel = { provider: "openrouter", name: "gpt-4", id: "gpt-4" };
    await POST(makeRequest({ messages: MESSAGES, chatModel }));
    expect(streamTextMock).toHaveBeenCalledWith(
      expect.objectContaining({ model: expect.anything() }),
    );
  });

  it("getSession is called exactly once per request", async () => {
    getSessionMock.mockResolvedValue(null);
    await POST(makeRequest({ messages: MESSAGES }));
    expect(getSessionMock).toHaveBeenCalledTimes(1);
  });

  it("does not call getUserPreferences when session is null", async () => {
    getSessionMock.mockResolvedValue(null);
    await POST(makeRequest({ messages: MESSAGES }));
    expect(getUserPreferencesMock).not.toHaveBeenCalled();
  });

  it("streamText receives a system prompt argument", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    await POST(makeRequest({ messages: MESSAGES }));
    expect(streamTextMock).toHaveBeenCalledWith(
      expect.objectContaining({ system: expect.any(String) }),
    );
  });
});
