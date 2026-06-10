import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSessionMock } = vi.hoisted(() => ({ getSessionMock: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("auth/server", () => ({ getSession: getSessionMock }));
vi.mock("lib/ai/models", () => ({
  customModelProvider: { getModel: vi.fn(() => ({})) },
  isToolCallUnsupportedModel: vi.fn(() => false),
}));
vi.mock("lib/ai/routing/route-model", () => ({
  routeModel: vi.fn().mockResolvedValue({}),
}));
// ADR-0009: the route runs the REAL resolveEffectiveModelAllowList; only its
// two layer sources are mocked, so user grants genuinely layer on team lists.
vi.mock("lib/admin/model-policy", () => ({
  getOrgBaseModelAllowList: vi.fn().mockResolvedValue(null),
  resolveTeamModelAllowList: vi.fn().mockResolvedValue(null),
}));
vi.mock("lib/admin/user-grants", () => ({
  getUserModelGrants: vi.fn().mockResolvedValue([]),
}));
vi.mock("lib/ai/guardrails", () => ({
  wrapWithGuardrails: vi.fn((m: unknown) => m),
}));
vi.mock("lib/ai/compression", () => ({
  wrapWithCompression: vi.fn((m: unknown) => m),
  compressionLevelFromPolicy: vi.fn(() => "off"),
}));
vi.mock("lib/ai/fallback", () => ({
  wrapWithFallback: vi.fn((m: unknown) => m),
  FALLBACK_MODEL_IDS: [],
}));
vi.mock("lib/compliance/audit", () => ({
  auditChatRequest: vi.fn(),
  hashContent: vi.fn(() => "hash"),
}));
vi.mock("lib/db/repository", () => ({
  agentRepository: {
    findById: vi.fn().mockResolvedValue(null),
    updateAgent: vi.fn(),
  },
  chatRepository: {
    upsertThread: vi.fn(),
    saveMessages: vi.fn(),
    selectThreadDetails: vi.fn().mockResolvedValue(null),
    insertThread: vi.fn().mockResolvedValue({ id: "t1" }),
    upsertMessage: vi.fn(),
  },
}));
vi.mock("lib/ai/prompts", () => ({
  buildUserSystemPrompt: vi.fn(() => ""),
  buildMcpServerCustomizationsSystemPrompt: vi.fn(() => ""),
  buildToolCallUnsupportedModelSystemPrompt: vi.fn(() => ""),
}));
vi.mock("lib/ai/embeddings/retrieval", () => ({
  retrieveForChat: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/lib/ai/ingest/csv-ingest", () => ({
  buildCsvIngestionPreviewParts: vi.fn().mockResolvedValue([]),
}));
vi.mock("lib/file-storage", () => ({
  serverFileStorage: { getSourceUrl: vi.fn() },
}));
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
vi.mock("lib/observability/kill-switch", () => ({
  checkKillSwitch: vi.fn().mockResolvedValue(null),
}));
vi.mock("lib/rate-limit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue(null),
}));
vi.mock("lib/ai/budget", () => ({
  checkBudget: vi.fn().mockResolvedValue(null),
  estimateCostUsd: vi.fn().mockResolvedValue(0),
  recordUsage: vi.fn().mockResolvedValue(null),
}));
vi.mock("lib/admin/teams", () => ({
  getUserPrimaryTeamId: vi.fn().mockResolvedValue(null),
  getTeamPolicy: vi.fn().mockResolvedValue(null),
}));
vi.mock("lib/user/server", () => ({
  getUserPreferences: vi.fn().mockResolvedValue(null),
}));
vi.mock("lib/ai/mcp/audit", () => ({ auditMcpInvocation: vi.fn() }));
vi.mock("lib/utils", () => ({
  generateUUID: vi.fn(() => "uuid-1"),
  errorToString: vi.fn((e: any) => String(e)),
  exclude: vi.fn((o: any) => o),
  objectFlow: vi.fn(() => ({
    filter: vi.fn(() => ({})),
    map: vi.fn(() => ({})),
    forEach: vi.fn(),
  })),
}));
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
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));
vi.mock("consola/utils", () => ({ colorize: (_c: string, s: string) => s }));
vi.mock("ts-safe", () => ({
  safe: vi.fn(() => ({
    ifOk: () => ({ ifFail: () => ({ unwrap: () => null }) }),
  })),
  errorIf: vi.fn(),
}));
vi.mock("app-types/chat", () => ({
  chatApiSchemaRequestBodySchema: { parse: (b: unknown) => b },
}));
vi.mock("ai", () => ({
  convertToModelMessages: vi.fn(() => []),
  createUIMessageStream: vi.fn(() => ({})),
  createUIMessageStreamResponse: vi.fn(() => new Response("{}")),
  smoothStream: vi.fn(() => ({})),
  stepCountIs: vi.fn(() => false),
  streamText: vi.fn(() => ({
    toUIMessageStreamResponse: vi.fn(() => new Response("{}")),
  })),
}));
vi.mock("lib/ai/tools", () => ({ ImageToolName: "image" }));
vi.mock("lib/ai/tools/image", () => ({
  nanoBananaTool: {},
  openaiImageTool: {},
}));

function makeRequest(body?: unknown): any {
  return {
    json: () => Promise.resolve(body ?? {}),
    signal: new AbortController().signal,
  };
}

describe("POST /api/chat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

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
    vi.mocked(checkRateLimit).mockResolvedValueOnce({
      allowed: false,
      limit: 10,
      remaining: 0,
      resetAt: 9999999999000,
    });
    const { POST } = await import("./route");
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(429);
  });
});

describe("POST /api/chat — additional guard chains", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

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
  beforeEach(() => {
    vi.clearAllMocks();
  });

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
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

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

  it("401 response body is the plain text 'Unauthorized'", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    const res = await POST(makeRequest({}));
    const body = await res.text();
    expect(body).toBe("Unauthorized");
  });
});

// ─── ADR-0009: layered model entitlements at the model seam ─────────────────

describe("POST /api/chat — layered model entitlements (ADR-0009)", () => {
  const baseBody = {
    id: "t1",
    message: {
      id: "m1",
      role: "user",
      parts: [{ type: "text", text: "hello there" }],
    },
    toolChoice: "none",
  };

  /** Wire every guard up to the entitlement check for an authenticated user. */
  async function setupAuthed(role: "admin" | "user") {
    getSessionMock.mockResolvedValue({ user: { id: "u1", role } });
    const { checkRateLimit } = await import("lib/rate-limit");
    vi.mocked(checkRateLimit).mockResolvedValue({
      allowed: true,
      limit: 10,
      remaining: 9,
      resetAt: Date.now() + 60_000,
    } as Awaited<ReturnType<typeof checkRateLimit>>);
    const { getUserPrimaryTeamId } = await import("lib/admin/teams");
    vi.mocked(getUserPrimaryTeamId).mockResolvedValue("team-1");
    const { chatRepository } = await import("lib/db/repository");
    vi.mocked(chatRepository.selectThreadDetails).mockResolvedValue({
      id: "t1",
      userId: "u1",
      messages: [],
    } as unknown as Awaited<
      ReturnType<typeof chatRepository.selectThreadDetails>
    >);
    const { checkBudget } = await import("lib/ai/budget");
    vi.mocked(checkBudget).mockResolvedValue({
      allowed: true,
    } as Awaited<ReturnType<typeof checkBudget>>);
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("403s an explicit pick outside the resolved allow-list, naming the model", async () => {
    await setupAuthed("admin");
    const { resolveTeamModelAllowList } = await import(
      "lib/admin/model-policy"
    );
    vi.mocked(resolveTeamModelAllowList).mockResolvedValue(["gpt-5.1"]);
    const { getUserModelGrants } = await import("lib/admin/user-grants");
    vi.mocked(getUserModelGrants).mockResolvedValue([]);

    const { POST } = await import("./route");
    const res = await POST(
      makeRequest({
        ...baseBody,
        chatModel: { provider: "openRouter", model: "claude-opus-4.8" },
      }),
    );

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.message).toContain("claude-opus-4.8");
    // explicit pick by an entitled-role user bypasses Auto routing entirely
    const { routeModel } = await import("lib/ai/routing/route-model");
    expect(vi.mocked(routeModel)).not.toHaveBeenCalled();
    const { customModelProvider } = await import("lib/ai/models");
    expect(vi.mocked(customModelProvider.getModel)).not.toHaveBeenCalled();
  });

  it("a user grant unlocks a model the team list blocks (additive override)", async () => {
    await setupAuthed("admin");
    const { resolveTeamModelAllowList } = await import(
      "lib/admin/model-policy"
    );
    vi.mocked(resolveTeamModelAllowList).mockResolvedValue(["gpt-5.1"]);
    const { getUserModelGrants } = await import("lib/admin/user-grants");
    vi.mocked(getUserModelGrants).mockResolvedValue(["claude-opus-4.8"]);

    const { POST } = await import("./route");
    const res = await POST(
      makeRequest({
        ...baseBody,
        chatModel: { provider: "openRouter", model: "claude-opus-4.8" },
      }),
    );

    expect(res.status).not.toBe(403);
    const { customModelProvider } = await import("lib/ai/models");
    expect(vi.mocked(customModelProvider.getModel)).toHaveBeenCalledWith({
      provider: "openRouter",
      model: "claude-opus-4.8",
    });
  });

  it("Auto routing receives the resolved allow-list (team list + user grants)", async () => {
    await setupAuthed("user"); // role "user" → forced Auto
    const { resolveTeamModelAllowList } = await import(
      "lib/admin/model-policy"
    );
    vi.mocked(resolveTeamModelAllowList).mockResolvedValue([
      "gemini-2.5-flash",
    ]);
    const { getUserModelGrants } = await import("lib/admin/user-grants");
    vi.mocked(getUserModelGrants).mockResolvedValue(["o4-mini"]);
    const { routeModel } = await import("lib/ai/routing/route-model");
    vi.mocked(routeModel).mockReturnValue({
      model: { provider: "openRouter", model: "gemini-2.5-flash" },
      taskClass: "general",
      tier: "fast",
      reason: "task=general → fast",
      candidates: [{ provider: "openRouter", model: "gemini-2.5-flash" }],
    });

    const { POST } = await import("./route");
    const res = await POST(makeRequest(baseBody));

    expect(vi.mocked(routeModel)).toHaveBeenCalledWith(
      expect.objectContaining({
        allowedModels: ["gemini-2.5-flash", "o4-mini"],
      }),
    );
    expect(res.status).not.toBe(403);
  });

  it("403s as a backstop when routing falls back to a non-entitled model", async () => {
    await setupAuthed("user");
    const { resolveTeamModelAllowList } = await import(
      "lib/admin/model-policy"
    );
    vi.mocked(resolveTeamModelAllowList).mockResolvedValue([
      "some-unrouted-model",
    ]);
    const { routeModel } = await import("lib/ai/routing/route-model");
    // simulate the routing lib's "allow-list excludes every tier" fallback
    vi.mocked(routeModel).mockReturnValue({
      model: { provider: "openRouter", model: "gemini-2.5-flash" },
      taskClass: "general",
      tier: "fast",
      reason: "task=general → fast",
      candidates: [{ provider: "openRouter", model: "gemini-2.5-flash" }],
    });

    const { POST } = await import("./route");
    const res = await POST(makeRequest(baseBody));

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.message).toContain("gemini-2.5-flash");
  });

  it("unrestricted resolution (all layers null) passes no allow-list to routing", async () => {
    await setupAuthed("user");
    const { resolveTeamModelAllowList } = await import(
      "lib/admin/model-policy"
    );
    vi.mocked(resolveTeamModelAllowList).mockResolvedValue(null);
    const { routeModel } = await import("lib/ai/routing/route-model");
    vi.mocked(routeModel).mockReturnValue({
      model: { provider: "openRouter", model: "gemini-2.5-flash" },
      taskClass: "general",
      tier: "fast",
      reason: "task=general → fast",
      candidates: [{ provider: "openRouter", model: "gemini-2.5-flash" }],
    });

    const { POST } = await import("./route");
    const res = await POST(makeRequest(baseBody));

    expect(vi.mocked(routeModel)).toHaveBeenCalledWith(
      expect.objectContaining({ allowedModels: undefined }),
    );
    expect(res.status).not.toBe(403);
    // grants are additive only — never consulted when nothing restricts
    const { getUserModelGrants } = await import("lib/admin/user-grants");
    expect(vi.mocked(getUserModelGrants)).not.toHaveBeenCalled();
  });
});
