import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  checkAccessMock: vi.fn(),
  streamTextMock: vi.fn(),
  checkRateLimitMock: vi.fn(),
  checkKillSwitchMock: vi.fn(),
  checkBudgetMock: vi.fn(),
  recordUsageMock: vi.fn(),
  getUserPrimaryTeamIdMock: vi.fn(),
  resolveEffectiveModelAllowListMock: vi.fn(),
  routeModelMock: vi.fn(),
  getModelMock: vi.fn(),
}));

vi.mock("auth/server", () => ({ getSession: h.getSessionMock }));
vi.mock("lib/db/repository", () => ({
  documentRepository: { checkAccess: h.checkAccessMock },
}));
vi.mock("ai", () => ({
  streamText: h.streamTextMock,
}));
vi.mock("lib/ai/models", () => ({
  customModelProvider: { getModel: h.getModelMock },
}));
vi.mock("lib/rate-limit", () => ({
  checkRateLimit: h.checkRateLimitMock,
}));
vi.mock("lib/observability/kill-switch", () => ({
  checkKillSwitch: h.checkKillSwitchMock,
}));
vi.mock("lib/ai/budget", () => ({
  checkBudget: h.checkBudgetMock,
  estimateCostUsd: vi.fn(() => 0),
  recordUsage: h.recordUsageMock,
}));
vi.mock("lib/admin/teams", () => ({
  getUserPrimaryTeamId: h.getUserPrimaryTeamIdMock,
}));
vi.mock("lib/admin/effective-models", () => ({
  resolveEffectiveModelAllowList: h.resolveEffectiveModelAllowListMock,
}));
vi.mock("lib/ai/routing/route-model", () => ({
  routeModel: h.routeModelMock,
}));

import { POST } from "./route";

const USER_ID = "user-abc";
const DOC_ID = "11111111-1111-1111-1111-111111111111";
const FAKE_MODEL = {};
const FAKE_STREAM_RESULT = {
  toTextStreamResponse: vi.fn(() => new Response("streamed", { status: 200 })),
};

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/documents/ai", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    action: "improve",
    selectedText: "Hello world",
    documentId: DOC_ID,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();

  // Default happy-path stubs
  h.getSessionMock.mockResolvedValue({ user: { id: USER_ID } });
  h.checkRateLimitMock.mockResolvedValue({
    allowed: true,
    limit: 60,
    remaining: 59,
    resetAt: 0,
  });
  h.checkAccessMock.mockResolvedValue(true);
  h.checkKillSwitchMock.mockResolvedValue(null);
  h.checkBudgetMock.mockResolvedValue({ allowed: true });
  h.getUserPrimaryTeamIdMock.mockResolvedValue("team-1");
  h.resolveEffectiveModelAllowListMock.mockResolvedValue(null);
  h.routeModelMock.mockReturnValue({
    model: { model: "test-model", provider: "test-provider" },
  });
  h.getModelMock.mockReturnValue(FAKE_MODEL);
  h.streamTextMock.mockReturnValue(FAKE_STREAM_RESULT);
  h.recordUsageMock.mockResolvedValue(undefined);
});

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------
describe("auth", () => {
  it("returns 401 when there is no session", async () => {
    h.getSessionMock.mockResolvedValue(null);
    const res = await POST(makeRequest(validBody()));
    expect(res.status).toBe(401);
  });

  it("returns 401 when session has no user id", async () => {
    h.getSessionMock.mockResolvedValue({ user: {} });
    const res = await POST(makeRequest(validBody()));
    expect(res.status).toBe(401);
  });

  it("proceeds past auth when session is valid", async () => {
    const res = await POST(makeRequest(validBody()));
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------------
describe("rate limiting", () => {
  it("returns 429 when rate limit is exceeded", async () => {
    h.checkRateLimitMock.mockResolvedValue({
      allowed: false,
      limit: 60,
      remaining: 0,
      resetAt: Date.now() + 1000,
    });
    const res = await POST(makeRequest(validBody()));
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.message).toMatch(/rate limit/i);
  });

  it("proceeds when rate limit check throws (fail-open)", async () => {
    h.checkRateLimitMock.mockRejectedValue(new Error("redis down"));
    const res = await POST(makeRequest(validBody()));
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// Input validation
// ---------------------------------------------------------------------------
describe("input validation", () => {
  it("returns 400 when action field is missing", async () => {
    const { action: _action, ...rest } = validBody();
    const res = await POST(makeRequest(rest));
    expect(res.status).toBe(400);
  });

  it("returns 400 when action is an unrecognised value", async () => {
    const res = await POST(makeRequest(validBody({ action: "summarise" })));
    expect(res.status).toBe(400);
  });

  it("returns 400 when selectedText is missing", async () => {
    const { selectedText: _st, ...rest } = validBody();
    const res = await POST(makeRequest(rest));
    expect(res.status).toBe(400);
  });

  it("returns 400 when selectedText is an empty string", async () => {
    const res = await POST(makeRequest(validBody({ selectedText: "" })));
    expect(res.status).toBe(400);
  });

  it("returns 400 when documentId is missing", async () => {
    const { documentId: _did, ...rest } = validBody();
    const res = await POST(makeRequest(rest));
    expect(res.status).toBe(400);
  });

  it("returns 400 when commentContext exceeds 2000 characters", async () => {
    const res = await POST(
      makeRequest(validBody({ commentContext: "x".repeat(2001) })),
    );
    expect(res.status).toBe(400);
  });

  it("accepts a valid body with all optional fields", async () => {
    const res = await POST(
      makeRequest(
        validBody({
          commentContext: "Looks good to me",
        }),
      ),
    );
    expect(res.status).toBe(200);
  });

  it("accepts commentContext at exactly 2000 characters", async () => {
    const res = await POST(
      makeRequest(validBody({ commentContext: "x".repeat(2000) })),
    );
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// Access control
// ---------------------------------------------------------------------------
describe("access control", () => {
  it("returns 403 when checkAccess returns false", async () => {
    h.checkAccessMock.mockResolvedValue(false);
    const res = await POST(makeRequest(validBody()));
    expect(res.status).toBe(403);
  });

  it("returns 403 when checkAccess throws", async () => {
    h.checkAccessMock.mockRejectedValue(new Error("db error"));
    const res = await POST(makeRequest(validBody()));
    expect(res.status).toBe(403);
  });

  it("proceeds when checkAccess returns true", async () => {
    h.checkAccessMock.mockResolvedValue(true);
    const res = await POST(makeRequest(validBody()));
    expect(res.status).toBe(200);
    expect(h.streamTextMock).toHaveBeenCalled();
  });

  it("calls checkAccess with the correct documentId and userId", async () => {
    await POST(makeRequest(validBody()));
    expect(h.checkAccessMock).toHaveBeenCalledWith(DOC_ID, USER_ID, false);
  });
});

// ---------------------------------------------------------------------------
// Kill switch & budget
// ---------------------------------------------------------------------------
describe("kill switch", () => {
  it("returns the kill-switch response when activated", async () => {
    const killResponse = new Response("Service disabled", { status: 503 });
    h.checkKillSwitchMock.mockResolvedValue(killResponse);
    const res = await POST(makeRequest(validBody()));
    expect(res.status).toBe(503);
  });
});

describe("budget", () => {
  it("returns 402 when team budget is exhausted", async () => {
    h.checkBudgetMock.mockResolvedValue({
      allowed: false,
      reason: "Team budget exhausted",
    });
    const res = await POST(makeRequest(validBody()));
    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.message).toBe("Team budget exhausted");
  });
});

// ---------------------------------------------------------------------------
// Happy path: actions
// ---------------------------------------------------------------------------
describe("action routing", () => {
  const SYSTEM_PROMPT_FRAGMENTS: Record<string, string> = {
    improve: "improve",
    shorten: "Condense",
    expand: "Expand",
    "tone-formal": "formal",
    "tone-casual": "conversational",
    "translate-es": "Spanish",
    "translate-fr": "French",
    "translate-de": "German",
    autocomplete: "Continue",
    "reply-comment": "reply",
  };

  for (const [action, fragment] of Object.entries(SYSTEM_PROMPT_FRAGMENTS)) {
    it(`action="${action}" → streamText called with a system prompt containing "${fragment}"`, async () => {
      const res = await POST(makeRequest(validBody({ action })));
      expect(res.status).toBe(200);
      expect(h.streamTextMock).toHaveBeenCalledOnce();
      const call = h.streamTextMock.mock.calls[0][0] as {
        system: string;
        prompt: string;
        model: unknown;
      };
      expect(call.system.toLowerCase()).toContain(fragment.toLowerCase());
    });
  }

  it('action="reply-comment" with commentContext uses the comment as the prompt', async () => {
    const commentContext = "This section is unclear";
    await POST(
      makeRequest(validBody({ action: "reply-comment", commentContext })),
    );
    const call = h.streamTextMock.mock.calls[0][0] as { prompt: string };
    expect(call.prompt).toContain(commentContext);
    expect(call.prompt).not.toContain("Hello world");
  });

  it('action="reply-comment" without commentContext falls back to selectedText', async () => {
    await POST(makeRequest(validBody({ action: "reply-comment" })));
    const call = h.streamTextMock.mock.calls[0][0] as { prompt: string };
    expect(call.prompt).toBe("Hello world");
  });

  it("non-comment actions always use selectedText as the prompt", async () => {
    await POST(
      makeRequest(
        validBody({ action: "shorten", selectedText: "Make me shorter" }),
      ),
    );
    const call = h.streamTextMock.mock.calls[0][0] as { prompt: string };
    expect(call.prompt).toBe("Make me shorter");
  });

  it("passes the resolved model to streamText", async () => {
    await POST(makeRequest(validBody()));
    const call = h.streamTextMock.mock.calls[0][0] as { model: unknown };
    expect(call.model).toBe(FAKE_MODEL);
  });
});

// ---------------------------------------------------------------------------
// Response shape
// ---------------------------------------------------------------------------
describe("response", () => {
  it("delegates the response to result.toTextStreamResponse()", async () => {
    const res = await POST(makeRequest(validBody()));
    expect(FAKE_STREAM_RESULT.toTextStreamResponse).toHaveBeenCalled();
    expect(res.status).toBe(200);
  });
});
