/**
 * Integration tests for the research mode gate in POST /api/chat.
 *
 * Focus: the effectiveResearchMode logic and its effect on allowedAppDefaultToolkit.
 * The full AI streaming pipeline is mocked; we test authorization and toolkit
 * construction, not the streaming machinery itself.
 *
 *   const effectiveResearchMode = isElevated && !!researchMode
 *   const allowedAppDefaultToolkit = effectiveResearchMode
 *     ? [...new Set([...(rawToolkit ?? []), "webSearch"])]
 *     : rawToolkit
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ── hoisted mocks ────────────────────────────────────────────────────────────
const h = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  isThreadSharedMock: vi.fn(),
  loadAppDefaultToolsMock: vi.fn(),
  aupGateResponseMock: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("auth/server", () => ({ getSession: h.getSessionMock }));

// AUP gate: default pass-through (null = accepted); individual tests can
// override to simulate the AUP-required 403.
vi.mock("lib/compliance/aup", () => ({
  aupGateResponse: h.aupGateResponseMock,
}));

vi.mock("lib/ai/models", () => ({
  customModelProvider: { getModel: vi.fn(() => ({})) },
  isToolCallUnsupportedModel: vi.fn(() => false),
}));
vi.mock("lib/ai/routing/route-model", () => ({
  routeModel: vi.fn().mockReturnValue({
    model: { provider: "openRouter", model: "gemini-3.5-flash" },
    taskClass: "general",
    tier: "fast",
    reason: "test",
    candidates: [],
  }),
}));
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
    selectThreadDetails: vi.fn().mockResolvedValue(null),
    insertThread: vi.fn().mockResolvedValue({ id: "t1" }),
    upsertMessage: vi.fn(),
    saveMessages: vi.fn(),
    upsertThread: vi.fn(),
  },
  storageObjectRepository: {
    canAccessStorageKey: vi.fn().mockResolvedValue(true),
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
  serverFileStorage: { download: vi.fn(), getSourceUrl: vi.fn() },
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
  checkRateLimit: vi.fn().mockResolvedValue({
    allowed: true,
    limit: 100,
    remaining: 99,
    resetAt: Date.now() + 60_000,
  }),
}));
vi.mock("lib/ai/budget", () => ({
  checkBudget: vi.fn().mockResolvedValue({ allowed: true }),
  estimateCostUsd: vi.fn().mockReturnValue(0),
  recordUsage: vi.fn().mockResolvedValue(null),
}));
vi.mock("lib/admin/teams", () => ({
  getUserPrimaryTeamId: vi.fn().mockResolvedValue(null),
  getTeamPolicy: vi.fn().mockResolvedValue(null),
  resolveEffectiveToolPolicy: vi.fn().mockResolvedValue({
    allowWebSearch: true,
    allowCodeExec: true,
    allowHttp: true,
  }),
  resolveStrictestGuardrailPolicy: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("lib/teamspaces/folders", () => ({
  isThreadShared: h.isThreadSharedMock,
}));
vi.mock("lib/user/server", () => ({
  getUserPreferences: vi.fn().mockResolvedValue(null),
}));
vi.mock("lib/ai/mcp/audit", () => ({ auditMcpInvocation: vi.fn() }));
vi.mock("lib/memory/policy", () => ({
  resolveMemoryPolicy: vi.fn().mockResolvedValue({ enabled: false }),
}));
vi.mock("lib/memory/inject", () => ({
  buildMemoryPromptBlock: vi.fn().mockResolvedValue(null),
}));
vi.mock("lib/memory/extract", () => ({
  runPostTurnMemoryExtraction: vi.fn().mockResolvedValue(0),
}));
vi.mock("lib/utils", () => ({
  generateUUID: vi.fn(() => "uuid-research-1"),
  errorToString: vi.fn((e: unknown) => String(e)),
  exclude: vi.fn((o: unknown) => o),
  objectFlow: vi.fn(() => ({
    filter: vi.fn(() => ({})),
    map: vi.fn(() => ({})),
    forEach: vi.fn(),
  })),
}));
vi.mock("./shared.chat", () => ({
  filterMCPToolsByMentions: vi.fn((t: unknown) => t),
  filterMCPToolsByAllowedMCPServers: vi.fn((t: unknown) => t),
  extractInProgressToolPart: vi.fn(() => []),
  filterMcpServerCustomizations: vi.fn(() => ({})),
  loadMcpTools: vi.fn().mockResolvedValue({}),
  loadWorkFlowTools: vi.fn().mockResolvedValue({}),
  loadAppDefaultTools: h.loadAppDefaultToolsMock,
  filterAppDefaultToolsByTeamPolicy: vi.fn((t: unknown) => t),
  mergeSystemPrompt: vi.fn(() => "sys"),
  workflowToVercelAITools: vi.fn(() => ({})),
  handleError: vi.fn((e: unknown) => String(e)),
  manualToolExecuteByLastMessage: vi.fn(),
  convertToSavePart: vi.fn((p: unknown) => p),
  excludeToolExecution: vi.fn((t: unknown) => t),
  wrapToolsWithGuardrails: vi.fn((t: unknown) => t),
}));
vi.mock("logger", () => ({
  default: {
    withDefaults: () => ({
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
    }),
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));
vi.mock("consola/utils", () => ({ colorize: (_c: string, s: string) => s }));
vi.mock("ts-safe", async (importOriginal) => await importOriginal());
vi.mock("app-types/chat", () => ({
  chatApiSchemaRequestBodySchema: { parse: (b: unknown) => b },
}));
vi.mock("ai", () => ({
  convertToModelMessages: vi.fn(() => []),
  createUIMessageStream: vi.fn(
    (opts: { execute: (args: { writer: unknown }) => Promise<void> }) => {
      // Eagerly run execute so the toolkit call happens synchronously in tests.
      opts
        .execute({
          writer: { write: vi.fn(), merge: vi.fn(), onError: vi.fn() },
        })
        .catch(() => {});
      return {};
    },
  ),
  createUIMessageStreamResponse: vi.fn(
    () => new Response("{}", { status: 200 }),
  ),
  smoothStream: vi.fn(() => ({})),
  stepCountIs: vi.fn(() => false),
  streamText: vi.fn(() => ({
    consumeStream: vi.fn(),
    toUIMessageStream: vi.fn(() => ({})),
    text: Promise.resolve("AI response text"),
    toUIMessageStreamResponse: vi.fn(() => new Response("{}")),
  })),
}));
vi.mock("lib/ai/tools", () => ({ ImageToolName: "image" }));
vi.mock("lib/ai/tools/image", () => ({
  nanoBananaTool: {},
  openaiImageTool: {},
}));
vi.mock("./actions", () => ({
  rememberAgentAction: vi.fn().mockResolvedValue(null),
  rememberMcpServerCustomizationsAction: vi.fn().mockResolvedValue({}),
}));
vi.mock("./shared-stream-partials", () => ({
  createPartialPersister: vi.fn(() => ({
    append: vi.fn(),
    flush: vi.fn(),
  })),
}));
vi.mock("lib/ai/follow-ups", () => ({
  generateFollowUps: vi.fn().mockResolvedValue([]),
  FOLLOW_UPS_PART_TYPE: "follow-ups",
}));

// ── helpers ──────────────────────────────────────────────────────────────────

function makeRequest(body?: unknown): Request {
  return new Request("http://localhost/api/chat", {
    method: "POST",
    body: JSON.stringify(body ?? {}),
    headers: { "Content-Type": "application/json" },
  });
}

/** Minimal valid POST body that clears all guards up to the toolkit assembly. */
const BASE_BODY = {
  id: "t1",
  message: {
    id: "m1",
    role: "user",
    parts: [{ type: "text", text: "Hello" }],
  },
  toolChoice: "auto",
  mentions: [],
  attachments: [],
};

/** Wire a session with a given role plus all the guards that fire after auth. */
async function setupSession(role: "admin" | "editor" | "user") {
  h.getSessionMock.mockResolvedValue({ user: { id: "u1", role } });
  h.aupGateResponseMock.mockResolvedValue(null); // AUP accepted
  h.isThreadSharedMock.mockResolvedValue(false);
  h.loadAppDefaultToolsMock.mockResolvedValue({});

  // Provide an existing thread owned by the same user so the 403-thread guard
  // is bypassed.
  const { chatRepository } = await import("lib/db/repository");
  vi.mocked(chatRepository.selectThreadDetails).mockResolvedValue({
    id: "t1",
    userId: "u1",
    messages: [],
  } as unknown as Awaited<
    ReturnType<typeof chatRepository.selectThreadDetails>
  >);
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe("POST /api/chat — research mode gate (effectiveResearchMode)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── auth guard ─────────────────────────────────────────────────────────────

  it("returns 401 when no session", async () => {
    h.getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    const res = await POST(makeRequest(BASE_BODY));
    expect(res.status).toBe(401);
  });

  it("returns 401 with text body 'Unauthorized' when session is missing", async () => {
    h.getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    const res = await POST(makeRequest(BASE_BODY));
    const text = await res.text();
    expect(text).toBe("Unauthorized");
  });

  it("returns 401 when session has no user id", async () => {
    h.getSessionMock.mockResolvedValue({ user: {} });
    const { POST } = await import("./route");
    const res = await POST(makeRequest(BASE_BODY));
    expect(res.status).toBe(401);
  });

  it("proceeds past auth when session is present", async () => {
    await setupSession("admin");
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ ...BASE_BODY, researchMode: false }));
    // Any non-401 response means auth passed.
    expect(res.status).not.toBe(401);
  });

  // ── effectiveResearchMode: elevated roles ──────────────────────────────────

  it("admin + researchMode:true → loadAppDefaultTools receives toolkit containing 'webSearch'", async () => {
    await setupSession("admin");
    const { POST } = await import("./route");
    await POST(
      makeRequest({
        ...BASE_BODY,
        researchMode: true,
        allowedAppDefaultToolkit: [],
      }),
    );

    expect(h.loadAppDefaultToolsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        allowedAppDefaultToolkit: expect.arrayContaining(["webSearch"]),
      }),
    );
  });

  it("editor + researchMode:true → loadAppDefaultTools receives toolkit containing 'webSearch'", async () => {
    await setupSession("editor");
    const { POST } = await import("./route");
    await POST(
      makeRequest({
        ...BASE_BODY,
        researchMode: true,
        allowedAppDefaultToolkit: [],
      }),
    );

    expect(h.loadAppDefaultToolsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        allowedAppDefaultToolkit: expect.arrayContaining(["webSearch"]),
      }),
    );
  });

  // ── effectiveResearchMode: non-elevated role ───────────────────────────────

  it("regular user + researchMode:true → effectiveResearchMode is false (webSearch NOT forced)", async () => {
    await setupSession("user");
    const { POST } = await import("./route");
    await POST(
      makeRequest({
        ...BASE_BODY,
        researchMode: true,
        allowedAppDefaultToolkit: [],
      }),
    );

    // loadAppDefaultTools should be called with the original (empty) toolkit, not
    // a forced one containing webSearch.
    const call = h.loadAppDefaultToolsMock.mock.calls[0];
    if (call) {
      const passedToolkit = (call[0] as { allowedAppDefaultToolkit?: string[] })
        .allowedAppDefaultToolkit;
      expect(passedToolkit).not.toContain("webSearch");
    }
    // If loadAppDefaultTools was never called (toolCall not allowed for basic
    // user), that also satisfies the gate — webSearch was never forced.
    // The important thing is it was NOT called with webSearch injected.
  });

  it("regular user + researchMode:true → toolkit passed through as-is (no webSearch injection)", async () => {
    await setupSession("user");
    const { POST } = await import("./route");
    const originalToolkit = ["codeInterpreter"];
    await POST(
      makeRequest({
        ...BASE_BODY,
        researchMode: true,
        allowedAppDefaultToolkit: originalToolkit,
      }),
    );

    if (h.loadAppDefaultToolsMock.mock.calls.length > 0) {
      const call = h.loadAppDefaultToolsMock.mock.calls[0];
      const passedToolkit = (call[0] as { allowedAppDefaultToolkit?: string[] })
        .allowedAppDefaultToolkit;
      // toolkit must not have been mutated to include webSearch
      expect(passedToolkit).not.toContain("webSearch");
    }
  });

  // ── effectiveResearchMode: flag off ───────────────────────────────────────

  it("admin + researchMode:false → effectiveResearchMode is false (no webSearch forced)", async () => {
    await setupSession("admin");
    const { POST } = await import("./route");
    await POST(
      makeRequest({
        ...BASE_BODY,
        researchMode: false,
        allowedAppDefaultToolkit: [],
      }),
    );

    if (h.loadAppDefaultToolsMock.mock.calls.length > 0) {
      const call = h.loadAppDefaultToolsMock.mock.calls[0];
      const passedToolkit = (call[0] as { allowedAppDefaultToolkit?: string[] })
        .allowedAppDefaultToolkit;
      expect(passedToolkit).not.toContain("webSearch");
    }
  });

  it("admin + researchMode:undefined → effectiveResearchMode is false (no webSearch forced)", async () => {
    await setupSession("admin");
    const { POST } = await import("./route");
    // omit researchMode entirely — it will be undefined
    await POST(makeRequest({ ...BASE_BODY, allowedAppDefaultToolkit: [] }));

    if (h.loadAppDefaultToolsMock.mock.calls.length > 0) {
      const call = h.loadAppDefaultToolsMock.mock.calls[0];
      const passedToolkit = (call[0] as { allowedAppDefaultToolkit?: string[] })
        .allowedAppDefaultToolkit;
      expect(passedToolkit).not.toContain("webSearch");
    }
  });

  // ── toolkit merging ────────────────────────────────────────────────────────

  it("admin + researchMode:true + existing toolkit → webSearch is added alongside existing tools", async () => {
    await setupSession("admin");
    const { POST } = await import("./route");
    await POST(
      makeRequest({
        ...BASE_BODY,
        researchMode: true,
        allowedAppDefaultToolkit: ["codeInterpreter", "httpFetch"],
      }),
    );

    expect(h.loadAppDefaultToolsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        allowedAppDefaultToolkit: expect.arrayContaining([
          "codeInterpreter",
          "httpFetch",
          "webSearch",
        ]),
      }),
    );
  });

  it("admin + researchMode:true + toolkit already has webSearch → no duplicate", async () => {
    await setupSession("admin");
    const { POST } = await import("./route");
    await POST(
      makeRequest({
        ...BASE_BODY,
        researchMode: true,
        allowedAppDefaultToolkit: ["webSearch", "codeInterpreter"],
      }),
    );

    expect(h.loadAppDefaultToolsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        allowedAppDefaultToolkit: expect.arrayContaining(["webSearch"]),
      }),
    );
    // The toolkit passed to loadAppDefaultTools must not have duplicate webSearch.
    const call = h.loadAppDefaultToolsMock.mock.calls[0];
    if (call) {
      const toolkit =
        (call[0] as { allowedAppDefaultToolkit?: string[] })
          .allowedAppDefaultToolkit ?? [];
      const webSearchCount = toolkit.filter((t) => t === "webSearch").length;
      expect(webSearchCount).toBe(1);
    }
  });

  it("admin + researchMode:true + null toolkit → toolkit becomes ['webSearch']", async () => {
    await setupSession("admin");
    const { POST } = await import("./route");
    // No allowedAppDefaultToolkit key → rawToolkit is undefined → ?? [] → ["webSearch"]
    await POST(makeRequest({ ...BASE_BODY, researchMode: true }));

    expect(h.loadAppDefaultToolsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        allowedAppDefaultToolkit: expect.arrayContaining(["webSearch"]),
      }),
    );
    const call = h.loadAppDefaultToolsMock.mock.calls[0];
    if (call) {
      const toolkit =
        (call[0] as { allowedAppDefaultToolkit?: string[] })
          .allowedAppDefaultToolkit ?? [];
      expect(toolkit).toEqual(["webSearch"]);
    }
  });

  // ── rate limit ────────────────────────────────────────────────────────────

  it("returns 429 when rate limit is exceeded, even for an admin with researchMode:true", async () => {
    h.getSessionMock.mockResolvedValue({ user: { id: "u1", role: "admin" } });
    h.aupGateResponseMock.mockResolvedValue(null);
    const { checkRateLimit } = await import("lib/rate-limit");
    vi.mocked(checkRateLimit).mockResolvedValueOnce({
      allowed: false,
      limit: 10,
      remaining: 0,
      resetAt: Date.now() + 60_000,
    });

    const { POST } = await import("./route");
    const res = await POST(makeRequest({ ...BASE_BODY, researchMode: true }));
    expect(res.status).toBe(429);
  });

  // ── budget guard ──────────────────────────────────────────────────────────

  it("returns 402 when budget is exhausted, even for an admin with researchMode:true", async () => {
    await setupSession("admin");
    const { checkBudget } = await import("lib/ai/budget");
    vi.mocked(checkBudget).mockResolvedValueOnce({
      allowed: false,
      reason: "Monthly budget exceeded",
    } as Awaited<ReturnType<typeof checkBudget>>);

    const { POST } = await import("./route");
    const res = await POST(makeRequest({ ...BASE_BODY, researchMode: true }));
    expect(res.status).toBe(402);
  });

  // ── AUP gate ──────────────────────────────────────────────────────────────

  it("returns 403 from AUP gate before research mode is evaluated", async () => {
    h.getSessionMock.mockResolvedValue({ user: { id: "u1", role: "admin" } });
    h.aupGateResponseMock.mockResolvedValue(
      Response.json({ error: "aup_required" }, { status: 403 }),
    );

    const { POST } = await import("./route");
    const res = await POST(makeRequest({ ...BASE_BODY, researchMode: true }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("aup_required");

    // The loadAppDefaultTools (where the toolkit is assembled) must never have
    // been reached — the AUP gate fires first.
    expect(h.loadAppDefaultToolsMock).not.toHaveBeenCalled();
  });

  // ── kill-switch ────────────────────────────────────────────────────────────

  it("kill switch blocks research mode requests before the rate-limit bucket is touched", async () => {
    h.getSessionMock.mockResolvedValue({ user: { id: "u1", role: "admin" } });
    h.aupGateResponseMock.mockResolvedValue(null);
    const { checkKillSwitch } = await import("lib/observability/kill-switch");
    vi.mocked(checkKillSwitch).mockResolvedValueOnce(
      new Response("Service unavailable", { status: 503 }),
    );

    const { checkRateLimit } = await import("lib/rate-limit");
    const { POST } = await import("./route");
    await POST(makeRequest({ ...BASE_BODY, researchMode: true }));

    // Rate limit must not have been incremented (kill switch fires first).
    expect(vi.mocked(checkRateLimit)).not.toHaveBeenCalled();
  });
});
