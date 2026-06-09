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

  it("returns 500 when OPENAI_API_KEY is missing", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ model: "gpt-4o" }));
    expect(res.status).toBe(500);
  });
});
