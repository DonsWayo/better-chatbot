import { describe, it, expect, vi, beforeEach } from "vitest";

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
vi.mock("lib/user/server", () => ({ getUserPreferences: vi.fn().mockResolvedValue(null) }));

function makeRequest(body?: unknown): any {
  return { json: () => Promise.resolve(body ?? {}) };
}

describe("POST /api/chat/openai-realtime", () => {
  beforeEach(() => { vi.clearAllMocks(); vi.stubEnv("OPENAI_API_KEY", "sk-test-key"); });

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
});
