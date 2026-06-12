import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getSessionMock,
  getModelMock,
  buildUserSystemPromptMock,
  getUserPreferencesMock,
  convertToModelMessagesMock,
  streamTextMock,
  wrapWithGuardrailsMock,
  getUserPrimaryTeamIdMock,
  getTeamPolicyMock,
  resolveEffectiveModelAllowListMock,
  checkKillSwitchMock,
  checkRateLimitMock,
  checkBudgetMock,
  recordUsageMock,
  estimateCostUsdMock,
  routeModelMock,
} = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  getModelMock: vi.fn(() => ({})),
  buildUserSystemPromptMock: vi.fn(() => "system-prompt"),
  getUserPreferencesMock: vi.fn().mockResolvedValue(null),
  convertToModelMessagesMock: vi.fn(() => []),
  streamTextMock: vi.fn((_opts?: unknown) => ({
    toUIMessageStreamResponse: vi.fn(() => new Response("stream")),
  })),
  wrapWithGuardrailsMock: vi.fn(
    (model: unknown, _userId: string, _policy?: string) => ({
      __guarded: true,
      inner: model,
    }),
  ),
  getUserPrimaryTeamIdMock: vi.fn().mockResolvedValue(null),
  getTeamPolicyMock: vi.fn().mockResolvedValue(null),
  resolveEffectiveModelAllowListMock: vi.fn().mockResolvedValue(null),
  checkKillSwitchMock: vi.fn().mockResolvedValue(null),
  checkRateLimitMock: vi
    .fn()
    .mockResolvedValue({ allowed: true, limit: 100, remaining: 99, resetAt: 0 }),
  checkBudgetMock: vi.fn().mockResolvedValue({ allowed: true }),
  recordUsageMock: vi.fn().mockResolvedValue(undefined),
  estimateCostUsdMock: vi.fn(() => 0.001),
  routeModelMock: vi.fn(() => ({
    model: { provider: "openRouter", model: "deepseek-v4-flash" },
    taskClass: "general",
    tier: "fast",
    reason: "test",
  })),
}));

vi.mock("auth/server", () => ({ getSession: getSessionMock }));
vi.mock("lib/ai/guardrails", () => ({
  wrapWithGuardrails: wrapWithGuardrailsMock,
}));
vi.mock("lib/ai/models", () => ({
  customModelProvider: { getModel: getModelMock },
}));
vi.mock("lib/ai/routing/route-model", () => ({ routeModel: routeModelMock }));
vi.mock("lib/ai/prompts", () => ({
  buildUserSystemPrompt: buildUserSystemPromptMock,
}));
vi.mock("lib/user/server", () => ({
  getUserPreferences: getUserPreferencesMock,
}));
vi.mock("lib/admin/effective-models", () => ({
  resolveEffectiveModelAllowList: resolveEffectiveModelAllowListMock,
}));
vi.mock("lib/admin/teams", () => ({
  getUserPrimaryTeamId: getUserPrimaryTeamIdMock,
  getTeamPolicy: getTeamPolicyMock,
}));
vi.mock("lib/ai/budget", () => ({
  checkBudget: checkBudgetMock,
  recordUsage: recordUsageMock,
  estimateCostUsd: estimateCostUsdMock,
}));
vi.mock("lib/observability/kill-switch", () => ({
  checkKillSwitch: checkKillSwitchMock,
}));
vi.mock("lib/rate-limit", () => ({ checkRateLimit: checkRateLimitMock }));
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
  return {
    json: () => Promise.resolve(body ?? {}),
    signal: new AbortController().signal,
  } as unknown as Request;
}

function resetEnforcementDefaults() {
  getUserPrimaryTeamIdMock.mockResolvedValue(null);
  getTeamPolicyMock.mockResolvedValue(null);
  resolveEffectiveModelAllowListMock.mockResolvedValue(null);
  checkKillSwitchMock.mockResolvedValue(null);
  checkRateLimitMock.mockResolvedValue({
    allowed: true,
    limit: 100,
    remaining: 99,
    resetAt: 0,
  });
  checkBudgetMock.mockResolvedValue({ allowed: true });
  routeModelMock.mockReturnValue({
    model: { provider: "openRouter", model: "deepseek-v4-flash" },
    taskClass: "general",
    tier: "fast",
    reason: "test",
  });
  streamTextMock.mockReturnValue({
    toUIMessageStreamResponse: vi.fn(() => new Response("ok")),
  });
}

describe("POST /api/chat/temporary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetEnforcementDefaults();
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

  it("streams response when authenticated (elevated, explicit pick)", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1", role: "admin" } });
    const { POST } = await import("./route");
    const res = await POST(
      makeRequest({
        messages: [],
        chatModel: { provider: "openRouter", model: "gpt-5.5" },
      }),
    );
    expect(res.status).toBe(200);
  });

  it("elevated user's explicit model pick is honored (no routing)", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1", role: "editor" } });
    const chatModel = { provider: "openRouter", model: "gpt-5.5" };
    const { POST } = await import("./route");
    await POST(makeRequest({ messages: [], chatModel }));
    expect(routeModelMock).not.toHaveBeenCalled();
    expect(getModelMock).toHaveBeenCalledWith(chatModel);
  });

  it("returns 500 when streamText throws", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1", role: "admin" } });
    streamTextMock.mockImplementationOnce(() => {
      throw new Error("model error");
    });
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ messages: [] }));
    expect(res.status).toBe(500);
  });

  it("includes instructions in system prompt when provided", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1", role: "admin" } });
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
});

describe("POST /api/chat/temporary — entitlement gate (ADR-0009)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetEnforcementDefaults();
  });

  it("basic user CANNOT pick a premium model — pick is ignored and Auto routing is forced", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "basic", role: "member" } });
    // Team confines the user to the cheap model only.
    resolveEffectiveModelAllowListMock.mockResolvedValue(["deepseek-v4-flash"]);
    getUserPrimaryTeamIdMock.mockResolvedValue("team-1");
    getTeamPolicyMock.mockResolvedValue({ guardrailPolicy: "standard" });
    const { POST } = await import("./route");
    await POST(
      makeRequest({
        messages: [{ role: "user", parts: [{ type: "text", text: "hi" }] }],
        // basic user tries to force opus
        chatModel: { provider: "openRouter", model: "claude-opus-4.8" },
      }),
    );
    // The basic user's premium pick is ignored; routing runs instead.
    expect(routeModelMock).toHaveBeenCalled();
    // The model that reaches getModel is the routed (allow-listed) one, NOT opus.
    expect(getModelMock).toHaveBeenCalledWith({
      provider: "openRouter",
      model: "deepseek-v4-flash",
    });
    expect(getModelMock).not.toHaveBeenCalledWith({
      provider: "openRouter",
      model: "claude-opus-4.8",
    });
  });

  it("returns 403 when the resolved model is outside the allow-list (backstop)", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1", role: "member" } });
    getUserPrimaryTeamIdMock.mockResolvedValue("team-1");
    resolveEffectiveModelAllowListMock.mockResolvedValue(["deepseek-v4-flash"]);
    // Routing returns a model not on the allow-list (degenerate case).
    routeModelMock.mockReturnValue({
      model: { provider: "openRouter", model: "claude-opus-4.8" },
      taskClass: "general",
      tier: "frontier",
      reason: "test",
    });
    const { POST } = await import("./route");
    const res = await POST(
      makeRequest({
        messages: [{ role: "user", parts: [{ type: "text", text: "hi" }] }],
      }),
    );
    expect(res.status).toBe(403);
    expect(streamTextMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/chat/temporary — budget & kill switch & rate limit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetEnforcementDefaults();
  });

  it("returns 402 when the team budget is exhausted (before streaming)", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1", role: "member" } });
    getUserPrimaryTeamIdMock.mockResolvedValue("team-1");
    checkBudgetMock.mockResolvedValue({
      allowed: false,
      reason: "Team budget exhausted",
    });
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ messages: [] }));
    expect(res.status).toBe(402);
    expect(streamTextMock).not.toHaveBeenCalled();
  });

  it("returns 429 when rate limited (before streaming)", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1", role: "member" } });
    checkRateLimitMock.mockResolvedValue({
      allowed: false,
      limit: 5,
      remaining: 0,
      resetAt: Date.now() + 1000,
    });
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ messages: [] }));
    expect(res.status).toBe(429);
    expect(streamTextMock).not.toHaveBeenCalled();
  });

  it("returns the kill-switch response when inference is globally blocked", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1", role: "member" } });
    checkKillSwitchMock.mockResolvedValue(
      new Response("kill", { status: 503 }),
    );
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ messages: [] }));
    expect(res.status).toBe(503);
    expect(streamTextMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/chat/temporary — metering (ADR-0003)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetEnforcementDefaults();
  });

  it("records usage attributed to userId + teamId in onFinish", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "metered", role: "admin" } });
    getUserPrimaryTeamIdMock.mockResolvedValue("team-9");
    let captured: any;
    streamTextMock.mockImplementationOnce((opts: any) => {
      captured = opts;
      return { toUIMessageStreamResponse: vi.fn(() => new Response("ok")) };
    });
    const { POST } = await import("./route");
    await POST(
      makeRequest({
        messages: [],
        chatModel: { provider: "openRouter", model: "gpt-5.5" },
      }),
    );
    // Simulate the model finishing.
    captured.onFinish({
      usage: { inputTokens: 100, outputTokens: 50 },
    });
    expect(recordUsageMock).toHaveBeenCalledTimes(1);
    const arg = recordUsageMock.mock.calls[0][0];
    expect(arg.userId).toBe("metered");
    expect(arg.teamId).toBe("team-9");
    expect(arg.sessionId).toBeNull();
    expect(arg.model).toBe("gpt-5.5");
  });
});

describe("POST /api/chat/temporary — guardrails (W7)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetEnforcementDefaults();
  });

  it("wraps the model with guardrails using the session userId + team policy", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u-guard", role: "admin" } });
    getUserPrimaryTeamIdMock.mockResolvedValue("team-1");
    getTeamPolicyMock.mockResolvedValue({ guardrailPolicy: "strict" });
    const rawModel = { raw: true };
    getModelMock.mockReturnValueOnce(rawModel);
    const { POST } = await import("./route");
    await POST(
      makeRequest({
        messages: [],
        chatModel: { provider: "openRouter", model: "gpt-5.5" },
      }),
    );
    expect(wrapWithGuardrailsMock).toHaveBeenCalledTimes(1);
    expect(wrapWithGuardrailsMock).toHaveBeenCalledWith(
      rawModel,
      "u-guard",
      "strict",
    );
  });

  it("passes the GUARDED model (not the raw one) to streamText", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1", role: "admin" } });
    const rawModel = { raw: true };
    getModelMock.mockReturnValueOnce(rawModel);
    let capturedModel: unknown;
    streamTextMock.mockImplementationOnce((opts: any) => {
      capturedModel = opts.model;
      return { toUIMessageStreamResponse: vi.fn(() => new Response("ok")) };
    });
    const { POST } = await import("./route");
    await POST(
      makeRequest({
        messages: [],
        chatModel: { provider: "openRouter", model: "gpt-5.5" },
      }),
    );
    expect(capturedModel).toEqual({ __guarded: true, inner: rawModel });
  });

  it("never wraps with guardrails when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    await POST(makeRequest({ messages: [] }));
    expect(wrapWithGuardrailsMock).not.toHaveBeenCalled();
  });
});
