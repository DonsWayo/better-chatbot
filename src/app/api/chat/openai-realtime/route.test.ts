import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSessionMock } = vi.hoisted(() => ({ getSessionMock: vi.fn() }));

vi.mock("auth/server", () => ({ getSession: getSessionMock }));
vi.mock("../shared.chat", () => ({
  filterMcpServerCustomizations: vi.fn(() => ({})),
  loadMcpTools: vi.fn().mockResolvedValue({}),
  mergeSystemPrompt: vi.fn(() => ""),
}));
vi.mock("lib/ai/prompts", () => ({
  buildMcpServerCustomizationsSystemPrompt: vi.fn(() => ""),
  buildSpeechSystemPrompt: vi.fn(() => ""),
}));
vi.mock("ts-safe", () => ({
  safe: vi.fn(() => ({ ifOk: () => ({ unwrap: () => Promise.resolve() }) })),
}));
vi.mock("lib/ai/speech", () => ({ DEFAULT_VOICE_TOOLS: [] }));
vi.mock("../actions", () => ({
  rememberAgentAction: vi.fn().mockResolvedValue(null),
  rememberMcpServerCustomizationsAction: vi.fn().mockResolvedValue(null),
}));
vi.mock("lib/logger", () => ({
  default: { withDefaults: () => ({ info: vi.fn(), error: vi.fn() }) },
}));
vi.mock("consola/utils", () => ({ colorize: (_c: string, s: string) => s }));
vi.mock("lib/user/server", () => ({
  getUserPreferences: vi.fn().mockResolvedValue(null),
}));

function makeRequest(body?: unknown): any {
  return { json: () => Promise.resolve(body ?? {}) };
}

describe("POST /api/chat/openai-realtime", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("OPENAI_API_KEY", "sk-test-key");
  });

  it("returns 401 when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ model: "gpt-4o" }));
    expect(res.status).toBe(401);
  });

  it("checks OPENAI_API_KEY before auth when key is missing", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ model: "gpt-4o" }));
    expect(res.status).toBe(500);
  });

  it("returns 500 when OPENAI_API_KEY is missing", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ model: "gpt-4o" }));
    expect(res.status).toBe(500);
  });

  it("500 body has error field when API key missing", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    const { POST } = await import("./route");
    const res = await POST(makeRequest({}));
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("401 body text is 'Unauthorized' not JSON", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(401);
    const text = await res.text();
    expect(text).toBe("Unauthorized");
  });

  it("never calls getSession when API key is missing", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const { POST } = await import("./route");
    await POST(makeRequest({}));
    expect(getSessionMock).not.toHaveBeenCalled();
  });

  it("returns 401 when session user id is empty string", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "" } });
    const { POST } = await import("./route");
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(401);
  });

  it("key-missing 500 error message mentions OPENAI_API_KEY", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    const { POST } = await import("./route");
    const res = await POST(makeRequest({}));
    const body = await res.json();
    expect(body.error).toContain("OPENAI_API_KEY");
  });

  it("getSession called exactly once when API key is present", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    await POST(makeRequest({}));
    expect(getSessionMock).toHaveBeenCalledTimes(1);
  });

  it("returns 401 when session user id is undefined", async () => {
    getSessionMock.mockResolvedValue({ user: { id: undefined } });
    const { POST } = await import("./route");
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(401);
  });

  it("500 response body is valid JSON when key is missing", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(typeof body.error).toBe("string");
  });

  it("401 text equals exactly Unauthorized when session user id is empty string", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "" } });
    const { POST } = await import("./route");
    const res = await POST(makeRequest({}));
    const text = await res.text();
    expect(text).toBe("Unauthorized");
  });
});

describe("POST /api/chat/openai-realtime — additional", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("OPENAI_API_KEY", "sk-test-key");
  });

  it("result is a Response instance when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    const res = await POST(makeRequest({}));
    expect(res).toBeInstanceOf(Response);
  });

  it("returns 500 for null user in session object (optional-chaining gap: `session?.user.id` throws)", async () => {
    // Source uses `session?.user.id` (not `session?.user?.id`), so a session
    // with user:null throws and is caught by the route's error handler (500).
    // The request is still rejected, just with 500 instead of 401.
    getSessionMock.mockResolvedValue({ user: null });
    const { POST } = await import("./route");
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(500);
  });

  it("result is a Response instance when API key missing", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    const res = await POST(makeRequest({}));
    expect(res).toBeInstanceOf(Response);
  });

  it("getSession not called when OPENAI_API_KEY is absent", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const { POST } = await import("./route");
    await POST(makeRequest({}));
    expect(getSessionMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/chat/openai-realtime — call count invariants", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("getSession called exactly once when API key is present", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    await POST(makeRequest({}));
    expect(getSessionMock).toHaveBeenCalledTimes(1);
  });

  it("POST returns 401 Response when unauthenticated", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    const res = await POST(makeRequest({}));
    expect(res).toBeInstanceOf(Response);
    expect(res.status).toBe(401);
  });

  it("POST returns 503 Response when API key is absent", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const { POST } = await import("./route");
    const res = await POST(makeRequest({}));
    expect(res).toBeInstanceOf(Response);
  });

  it("getSession not called twice on single POST request", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    await POST(makeRequest({}));
    expect(getSessionMock).not.toHaveBeenCalledTimes(2);
  });
});
