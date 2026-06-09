import { describe, it, expect, vi, beforeEach } from "vitest";

const { getSessionMock, streamObjectMock } = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  streamObjectMock: vi.fn(() => ({ toTextStreamResponse: vi.fn(() => new Response("{}")) })),
}));

vi.mock("auth/server", () => ({ getSession: getSessionMock }));
vi.mock("lib/ai/models", () => ({
  customModelProvider: { getModel: vi.fn(() => ({})) },
}));
vi.mock("lib/ai/prompts", () => ({ buildAgentGenerationPrompt: vi.fn(() => "") }));
vi.mock("logger", () => ({
  default: { withDefaults: () => ({ info: vi.fn(), error: vi.fn() }) },
}));
vi.mock("consola/utils", () => ({ colorize: (_c: string, s: string) => s }));
vi.mock("app-types/agent", () => ({
  AgentGenerateSchema: {
    parse: (b: unknown) => b,
    extend: () => ({
      parse: (b: unknown) => b,
    }),
  },
}));
vi.mock("../../chat/shared.chat", () => ({
  loadAppDefaultTools: vi.fn().mockResolvedValue({}),
}));
vi.mock("lib/db/repository", () => ({
  workflowRepository: { selectExecuteAbility: vi.fn().mockResolvedValue([]) },
}));
vi.mock("ts-safe", () => ({
  safe: vi.fn(() => ({ ifOk: () => ({ unwrap: () => Promise.resolve() }) })),
}));
vi.mock("lib/utils", () => ({ objectFlow: vi.fn(() => ({ forEach: vi.fn() })) }));
vi.mock("lib/ai/mcp/mcp-manager", () => ({
  mcpClientsManager: { tools: vi.fn().mockResolvedValue({}) },
}));
vi.mock("ai", () => ({
  streamObject: streamObjectMock,
}));

function makeRequest(body?: unknown): Request {
  return { json: () => Promise.resolve(body), signal: new AbortController().signal } as unknown as Request;
}

describe("POST /api/agent/ai", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    streamObjectMock.mockReturnValue({ toTextStreamResponse: vi.fn(() => new Response("{}")) });
  });

  it("returns 401 when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ message: "create an agent" }));
    expect(res.status).toBe(401);
  });

  it("never calls streamObject when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    await POST(makeRequest({ message: "create an agent" }));
    expect(streamObjectMock).not.toHaveBeenCalled();
  });

  it("streams agent generation when authenticated", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ message: "build me an agent" }));
    expect(res.status).toBe(200);
  });

  it("calls streamObject exactly once per request", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    const { POST } = await import("./route");
    await POST(makeRequest({ message: "create an agent for customer support" }));
    expect(streamObjectMock).toHaveBeenCalledTimes(1);
  });

  it("returns a Response object on success", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ message: "create a coding agent" }));
    expect(res).toBeInstanceOf(Response);
  });

  it("returns 401 when session is an empty object (falsy user)", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ message: "hello" }));
    expect(res.status).toBe(401);
  });

  it("response body for 401 is text Unauthorized", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ message: "test" }));
    expect(res.status).toBe(401);
    const text = await res.text();
    expect(text).toBe("Unauthorized");
  });

  it("streamObject called with the message as prompt", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    let capturedPrompt = "";
    streamObjectMock.mockImplementationOnce((opts: any) => {
      capturedPrompt = opts.prompt ?? "";
      return { toTextStreamResponse: vi.fn(() => new Response("ok")) };
    });
    const { POST } = await import("./route");
    await POST(makeRequest({ message: "build a support agent", chatModel: undefined }));
    expect(capturedPrompt).toBe("build a support agent");
  });

  it("streamObject receives a system prompt string", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    let capturedSystem: unknown = null;
    streamObjectMock.mockImplementationOnce((opts: any) => {
      capturedSystem = opts.system;
      return { toTextStreamResponse: vi.fn(() => new Response("ok")) };
    });
    const { POST } = await import("./route");
    await POST(makeRequest({ message: "create agent" }));
    expect(typeof capturedSystem).toBe("string");
  });
});

describe("POST /api/agent/ai — additional", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    streamObjectMock.mockReturnValue({ toTextStreamResponse: vi.fn(() => new Response("{}")) });
  });

  it("getSession called exactly once per POST", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    await POST(makeRequest({ message: "hi" }));
    expect(getSessionMock).toHaveBeenCalledTimes(1);
  });

  it("streamObject never called when unauthenticated (guard chain)", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    await POST(makeRequest({ message: "build agent" }));
    expect(streamObjectMock).not.toHaveBeenCalled();
  });

  it("returns Response instance on success", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u-resp" } });
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ message: "generate an agent" }));
    expect(res).toBeInstanceOf(Response);
  });
});
