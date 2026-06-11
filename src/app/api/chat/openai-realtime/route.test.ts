import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSessionMock, getTeamPolicyMock, getUserPrimaryTeamIdMock } =
  vi.hoisted(() => ({
    getSessionMock: vi.fn(),
    getTeamPolicyMock: vi.fn(),
    getUserPrimaryTeamIdMock: vi.fn(),
  }));

vi.mock("auth/server", () => ({ getSession: getSessionMock }));
vi.mock("lib/admin/teams", () => ({
  getTeamPolicy: getTeamPolicyMock,
  getUserPrimaryTeamId: getUserPrimaryTeamIdMock,
}));
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

function entitled() {
  getSessionMock.mockResolvedValue({ user: { id: "u1" } });
  getUserPrimaryTeamIdMock.mockResolvedValue("team-1");
  getTeamPolicyMock.mockResolvedValue({ allowSpeech: true });
}

function notEntitled() {
  getSessionMock.mockResolvedValue({ user: { id: "u1" } });
  getUserPrimaryTeamIdMock.mockResolvedValue("team-1");
  getTeamPolicyMock.mockResolvedValue({ allowSpeech: false });
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

  it("returns 401 (not 500) when unauthenticated and key missing — auth runs before key check", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ model: "gpt-4o" }));
    expect(res.status).toBe(401);
  });

  it("401 body text is 'Unauthorized' not JSON", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(401);
    const text = await res.text();
    expect(text).toBe("Unauthorized");
  });

  it("returns 401 when session user id is empty string", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "" } });
    const { POST } = await import("./route");
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(401);
  });

  it("returns 401 when session user id is undefined", async () => {
    getSessionMock.mockResolvedValue({ user: { id: undefined } });
    const { POST } = await import("./route");
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(401);
  });

  it("returns 403 when team policy does not allow speech", async () => {
    notEntitled();
    const { POST } = await import("./route");
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("Voice chat is not enabled for your team.");
  });

  it("returns 403 when user has no team", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    getUserPrimaryTeamIdMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(403);
    expect(getTeamPolicyMock).not.toHaveBeenCalled();
  });

  it("returns 403 (not 503) for non-entitled user even when key is missing — entitlement runs before key check", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    notEntitled();
    const { POST } = await import("./route");
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(403);
  });

  it("returns 503 with voice_not_configured for entitled user when key is missing", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    entitled();
    const { POST } = await import("./route");
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe("voice_not_configured");
    expect(body.message).toBe("Voice is not available on this deployment.");
  });

  it("503 body never mentions OPENAI_API_KEY", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    entitled();
    const { POST } = await import("./route");
    const res = await POST(makeRequest({}));
    const text = await res.text();
    expect(text).not.toContain("OPENAI_API_KEY");
  });

  it("getSession is always called, even when key is missing", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    await POST(makeRequest({}));
    expect(getSessionMock).toHaveBeenCalledTimes(1);
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

  it("result is a Response instance when API key missing for entitled user", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    entitled();
    const { POST } = await import("./route");
    const res = await POST(makeRequest({}));
    expect(res).toBeInstanceOf(Response);
    expect(res.status).toBe(503);
  });

  it("getSession called exactly once per request", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    await POST(makeRequest({}));
    expect(getSessionMock).toHaveBeenCalledTimes(1);
  });
});
