import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getSessionMock,
  getModelMock,
  buildUserSystemPromptMock,
  getUserPreferencesMock,
  convertToModelMessagesMock,
  streamTextMock,
  wrapWithGuardrailsMock,
} = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  getModelMock: vi.fn(() => ({})),
  buildUserSystemPromptMock: vi.fn(() => "system-prompt"),
  getUserPreferencesMock: vi.fn().mockResolvedValue(null),
  convertToModelMessagesMock: vi.fn(() => []),
  streamTextMock: vi.fn((_opts?: unknown) => ({
    toUIMessageStreamResponse: vi.fn(() => new Response("stream")),
  })),
  wrapWithGuardrailsMock: vi.fn((model: unknown, _userId: string) => ({
    __guarded: true,
    inner: model,
  })),
}));

vi.mock("auth/server", () => ({ getSession: getSessionMock }));
vi.mock("lib/ai/guardrails", () => ({
  wrapWithGuardrails: wrapWithGuardrailsMock,
}));
vi.mock("lib/ai/models", () => ({
  customModelProvider: { getModel: getModelMock },
}));
vi.mock("lib/ai/prompts", () => ({
  buildUserSystemPrompt: buildUserSystemPromptMock,
}));
vi.mock("lib/user/server", () => ({
  getUserPreferences: getUserPreferencesMock,
}));
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
  beforeEach(() => {
    vi.clearAllMocks();
  });

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
    const res = await POST(
      makeRequest({
        messages: [],
        chatModel: { provider: "anthropic", model: "claude-3" },
      }),
    );
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

  it("401 body is text 'Unauthorized'", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ messages: [] }));
    expect(res.status).toBe(401);
    const text = await res.text();
    expect(text).toBe("Unauthorized");
  });

  it("never calls streamText when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    await POST(makeRequest({ messages: [] }));
    expect(streamTextMock).not.toHaveBeenCalled();
  });

  it("streamText called exactly once per request", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    streamTextMock.mockReturnValueOnce({
      toUIMessageStreamResponse: vi.fn(() => new Response("ok")),
    });
    const { POST } = await import("./route");
    await POST(makeRequest({ messages: [] }));
    expect(streamTextMock).toHaveBeenCalledTimes(1);
  });
});

describe("POST /api/chat/temporary — guardrails (W7)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    streamTextMock.mockReturnValue({
      toUIMessageStreamResponse: vi.fn(() => new Response("ok")),
    });
  });

  it("wraps the model with guardrails using the session userId (org default policy)", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u-guard" } });
    const rawModel = { raw: true };
    getModelMock.mockReturnValueOnce(rawModel);
    const { POST } = await import("./route");
    await POST(makeRequest({ messages: [] }));
    expect(wrapWithGuardrailsMock).toHaveBeenCalledTimes(1);
    expect(wrapWithGuardrailsMock).toHaveBeenCalledWith(rawModel, "u-guard");
  });

  it("passes the GUARDED model (not the raw one) to streamText", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    const rawModel = { raw: true };
    getModelMock.mockReturnValueOnce(rawModel);
    let capturedModel: unknown;
    streamTextMock.mockImplementationOnce((opts: any) => {
      capturedModel = opts.model;
      return { toUIMessageStreamResponse: vi.fn(() => new Response("ok")) };
    });
    const { POST } = await import("./route");
    await POST(makeRequest({ messages: [] }));
    expect(capturedModel).toEqual({ __guarded: true, inner: rawModel });
  });

  it("never wraps with guardrails when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    await POST(makeRequest({ messages: [] }));
    expect(wrapWithGuardrailsMock).not.toHaveBeenCalled();
  });

  it("returns 500 when the guardrail-wrapped model pipeline throws (blocked input surfaces as error)", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    streamTextMock.mockImplementationOnce(() => {
      throw new Error("Guardrail blocked: secret detected in input.");
    });
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ messages: [] }));
    expect(res.status).toBe(500);
    expect(await res.text()).toMatch(/Guardrail blocked/);
  });
});

describe("POST /api/chat/temporary — additional", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    streamTextMock.mockReturnValue({
      toUIMessageStreamResponse: vi.fn(() => new Response("ok")),
    });
  });

  it("getSession called exactly once per POST", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    await POST(makeRequest({ messages: [] }));
    expect(getSessionMock).toHaveBeenCalledTimes(1);
  });

  it("getUserPreferences never called when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    await POST(makeRequest({ messages: [] }));
    expect(getUserPreferencesMock).not.toHaveBeenCalled();
  });

  it("returns a 200 Response on authenticated success", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u-test" } });
    const { POST } = await import("./route");
    const res = await POST(
      makeRequest({
        messages: [],
        chatModel: { provider: "openrouter", model: "gpt-5.5" },
      }),
    );
    expect(res.status).toBe(200);
    expect(res).toBeInstanceOf(Response);
  });
});

describe("POST /api/chat/temporary — response shape", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    streamTextMock.mockReturnValue({
      toUIMessageStreamResponse: vi.fn(() => new Response("ok")),
    });
  });

  it("returns a Response instance for 401", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ messages: [] }));
    expect(res).toBeInstanceOf(Response);
  });

  it("returns a Response instance for 500 (streamText throws)", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    streamTextMock.mockImplementationOnce(() => {
      throw new Error("model error");
    });
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ messages: [] }));
    expect(res).toBeInstanceOf(Response);
  });

  it("returns a Response instance for 200", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ messages: [] }));
    expect(res).toBeInstanceOf(Response);
  });

  it("getModel called exactly once per authenticated request", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    const { POST } = await import("./route");
    await POST(
      makeRequest({
        messages: [],
        chatModel: { provider: "openrouter", model: "gpt-5.5" },
      }),
    );
    expect(getModelMock).toHaveBeenCalledTimes(1);
  });
});

describe("POST /api/chat/temporary — call count invariants", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("getSession called exactly once per POST", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    await POST(makeRequest({ messages: [] }));
    expect(getSessionMock).toHaveBeenCalledTimes(1);
  });

  it("getModel not called when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    await POST(makeRequest({ messages: [] }));
    expect(getModelMock).not.toHaveBeenCalled();
  });

  it("streamText not called when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    await POST(makeRequest({ messages: [] }));
    expect(streamTextMock).not.toHaveBeenCalled();
  });

  it("POST returns 401 Response when session is null", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ messages: [] }));
    expect(res).toBeInstanceOf(Response);
    expect(res.status).toBe(401);
  });
});
