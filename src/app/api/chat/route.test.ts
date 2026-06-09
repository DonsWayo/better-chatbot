import { describe, it, expect, vi, beforeEach } from "vitest";

const { getSessionMock } = vi.hoisted(() => ({ getSessionMock: vi.fn() }));

vi.mock("auth/server", () => ({ getSession: getSessionMock }));
vi.mock("lib/ai/models", () => ({
  customModelProvider: { getModel: vi.fn(() => ({})) },
  isToolCallUnsupportedModel: vi.fn(() => false),
}));
vi.mock("lib/ai/routing/route-model", () => ({ routeModel: vi.fn().mockResolvedValue({}) }));
vi.mock("lib/db/repository", () => ({
  agentRepository: { findById: vi.fn().mockResolvedValue(null) },
  chatRepository: { upsertThread: vi.fn(), saveMessages: vi.fn() },
}));
vi.mock("lib/ai/prompts", () => ({
  buildUserSystemPrompt: vi.fn(() => ""),
  buildMcpServerCustomizationsSystemPrompt: vi.fn(() => ""),
  buildToolCallUnsupportedModelSystemPrompt: vi.fn(() => ""),
}));
vi.mock("lib/ai/embeddings/ingest", () => ({ retrieveChunks: vi.fn().mockResolvedValue([]) }));
vi.mock("@/lib/ai/ingest/csv-ingest", () => ({ buildCsvIngestionPreviewParts: vi.fn().mockResolvedValue([]) }));
vi.mock("lib/file-storage", () => ({ serverFileStorage: { getSourceUrl: vi.fn() } }));
vi.mock("lib/observability/metrics", () => ({
  chatErrorsTotal: { inc: vi.fn() },
  chatLatencyMs: { observe: vi.fn() },
  routingDecisionsTotal: { inc: vi.fn() },
}));
vi.mock("lib/observability/slo", () => ({
  activeRequests: { inc: vi.fn(), dec: vi.fn() },
  providerErrorsTotal: { inc: vi.fn() },
  rateLimitActivations: { inc: vi.fn() },
  ttftMs: { observe: vi.fn() },
}));
vi.mock("lib/observability/kill-switch", () => ({ checkKillSwitch: vi.fn().mockResolvedValue(null) }));
vi.mock("lib/rate-limit", () => ({ checkRateLimit: vi.fn().mockResolvedValue(null) }));
vi.mock("lib/ai/budget", () => ({
  checkBudget: vi.fn().mockResolvedValue(null),
  estimateCostUsd: vi.fn().mockResolvedValue(0),
  recordUsage: vi.fn().mockResolvedValue(null),
}));
vi.mock("lib/admin/teams", () => ({
  getUserPrimaryTeamId: vi.fn().mockResolvedValue(null),
  getTeamPolicy: vi.fn().mockResolvedValue(null),
}));
vi.mock("lib/user/server", () => ({ getUserPreferences: vi.fn().mockResolvedValue(null) }));
vi.mock("lib/ai/mcp/audit", () => ({ auditMcpInvocation: vi.fn() }));
vi.mock("lib/utils", () => ({ generateUUID: vi.fn(() => "uuid-1"), errorToString: vi.fn((e: any) => String(e)), exclude: vi.fn((o: any) => o), objectFlow: vi.fn(() => ({ filter: vi.fn(() => ({})), map: vi.fn(() => ({})), forEach: vi.fn() })) }));
vi.mock("./shared.chat", () => ({
  filterMCPToolsByMentions: vi.fn((tools: any) => tools),
  filterMCPToolsByAllowedMCPServers: vi.fn((tools: any) => tools),
  filterMcpServerCustomizations: vi.fn(() => ({})),
  loadMcpTools: vi.fn().mockResolvedValue({}),
  loadWorkFlowTools: vi.fn().mockResolvedValue({}),
  loadAppDefaultTools: vi.fn().mockResolvedValue({}),
  mergeSystemPrompt: vi.fn(() => ""),
  workflowToVercelAITools: vi.fn(() => ({})),
  handleError: vi.fn((e: any) => String(e)),
  manualToolExecuteByLastMessage: vi.fn(),
  convertToSavePart: vi.fn(),
  excludeToolExecution: vi.fn((t: any) => t),
}));
vi.mock("logger", () => ({
  default: {
    withDefaults: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn() }),
    info: vi.fn(), error: vi.fn(), warn: vi.fn(),
  },
}));
vi.mock("consola/utils", () => ({ colorize: (_c: string, s: string) => s }));
vi.mock("ts-safe", () => ({ safe: vi.fn(() => ({ ifOk: () => ({ ifFail: () => ({ unwrap: () => null }) }) })), errorIf: vi.fn() }));
vi.mock("app-types/chat", () => ({
  chatApiSchemaRequestBodySchema: { parse: (b: unknown) => b },
}));
vi.mock("ai", () => ({
  convertToModelMessages: vi.fn(() => []),
  createUIMessageStream: vi.fn(() => ({})),
  createUIMessageStreamResponse: vi.fn(() => new Response("{}")),
  smoothStream: vi.fn(() => ({})),
  stepCountIs: vi.fn(() => false),
  streamText: vi.fn(() => ({ toUIMessageStreamResponse: vi.fn(() => new Response("{}")) })),
}));
vi.mock("lib/ai/tools", () => ({ ImageToolName: "image" }));
vi.mock("lib/ai/tools/image", () => ({ nanoBananaTool: {}, openaiImageTool: {} }));

function makeRequest(body?: unknown): any {
  return { json: () => Promise.resolve(body ?? {}), signal: new AbortController().signal };
}

describe("POST /api/chat", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns 401 when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ messages: [], threadId: "t1" }));
    expect(res.status).toBe(401);
  });

  it("401 body is text 'Unauthorized'", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    const res = await POST(makeRequest({}));
    const text = await res.text();
    expect(text).toBe("Unauthorized");
  });

  it("never calls checkKillSwitch when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { checkKillSwitch } = await import("lib/observability/kill-switch");
    const { POST } = await import("./route");
    await POST(makeRequest({}));
    expect(vi.mocked(checkKillSwitch)).not.toHaveBeenCalled();
  });

  it("never calls checkRateLimit when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { checkRateLimit } = await import("lib/rate-limit");
    const { POST } = await import("./route");
    await POST(makeRequest({}));
    expect(vi.mocked(checkRateLimit)).not.toHaveBeenCalled();
  });

  it("returns 429 when rate limited", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    const { checkRateLimit } = await import("lib/rate-limit");
    vi.mocked(checkRateLimit).mockResolvedValueOnce({ allowed: false, limit: 10, remaining: 0, resetAt: 9999999999000 });
    const { POST } = await import("./route");
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(429);
  });
});

describe("POST /api/chat — additional guard chains", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("getSession called exactly once per POST", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    await POST(makeRequest({}));
    expect(getSessionMock).toHaveBeenCalledTimes(1);
  });

  it("never calls checkBudget when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { checkBudget } = await import("lib/ai/budget");
    const { POST } = await import("./route");
    await POST(makeRequest({}));
    expect(vi.mocked(checkBudget)).not.toHaveBeenCalled();
  });

  it("never calls routeModel when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { routeModel } = await import("lib/ai/routing/route-model");
    const { POST } = await import("./route");
    await POST(makeRequest({}));
    expect(vi.mocked(routeModel)).not.toHaveBeenCalled();
  });
});

describe("POST /api/chat — response shape", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns a Response instance for 401", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    const res = await POST(makeRequest({}));
    expect(res).toBeInstanceOf(Response);
  });

  it("never calls streamText when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { streamText } = await import("ai");
    const { POST } = await import("./route");
    await POST(makeRequest({}));
    expect(vi.mocked(streamText)).not.toHaveBeenCalled();
  });

  it("never calls getUserPreferences when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { getUserPreferences } = await import("lib/user/server");
    const { POST } = await import("./route");
    await POST(makeRequest({}));
    expect(vi.mocked(getUserPreferences)).not.toHaveBeenCalled();
  });

  it("never calls loadMcpTools when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { loadMcpTools } = await import("./shared.chat");
    const { POST } = await import("./route");
    await POST(makeRequest({}));
    expect(vi.mocked(loadMcpTools)).not.toHaveBeenCalled();
  });
});

describe("POST /api/chat — call count invariants", () => {
  beforeEach(() => { vi.clearAllMocks(); vi.resetModules(); });

  it("getSession called exactly once per POST", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    await POST(makeRequest({}));
    expect(getSessionMock).toHaveBeenCalledTimes(1);
  });

  it("POST returns 401 Response when session is null", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    const res = await POST(makeRequest({}));
    expect(res).toBeInstanceOf(Response);
    expect(res.status).toBe(401);
  });

  it("getSession not called twice on single POST", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    await POST(makeRequest({}));
    expect(getSessionMock).not.toHaveBeenCalledTimes(2);
  });

  it("401 response body has error field", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    const res = await POST(makeRequest({}));
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });
});
