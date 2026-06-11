/**
 * Tests for the desktop "governed coding" OpenRouter gateway:
 *   POST /api/gateway/openrouter/chat/completions
 *   GET  /api/gateway/openrouter/models
 *
 * External seams (better-auth session, entitlements, budget, audit, fetch)
 * are mocked the same way as other route tests — the suite exercises the
 * route handlers end to end.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  getSessionMock,
  getUserPrimaryTeamIdMock,
  resolveTeamModelAllowListMock,
  getOrgBaseModelAllowListMock,
  getUserModelGrantsMock,
  checkBudgetMock,
  recordUsageMock,
  writeAuditLogMock,
} = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  getUserPrimaryTeamIdMock: vi.fn(),
  resolveTeamModelAllowListMock: vi.fn(),
  getOrgBaseModelAllowListMock: vi.fn(),
  getUserModelGrantsMock: vi.fn(),
  checkBudgetMock: vi.fn(),
  recordUsageMock: vi.fn(),
  writeAuditLogMock: vi.fn(),
}));

vi.mock("auth/server", () => ({
  auth: { api: { getSession: getSessionMock } },
}));
vi.mock("lib/admin/teams", () => ({
  getUserPrimaryTeamId: getUserPrimaryTeamIdMock,
}));
vi.mock("lib/admin/model-policy", () => ({
  resolveTeamModelAllowList: resolveTeamModelAllowListMock,
  getOrgBaseModelAllowList: getOrgBaseModelAllowListMock,
}));
vi.mock("lib/admin/user-grants", () => ({
  getUserModelGrants: getUserModelGrantsMock,
}));
vi.mock("lib/ai/budget", async (importOriginal) => {
  const actual = await importOriginal<typeof import("lib/ai/budget")>();
  return {
    estimateCostUsd: actual.estimateCostUsd,
    checkBudget: checkBudgetMock,
    recordUsage: recordUsageMock,
  };
});
vi.mock("lib/compliance/audit", () => ({
  writeAuditLog: writeAuditLogMock,
}));

const FAKE_KEY = "sk-or-secret-test-key-123";
const TOKEN = "abc123.def456";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

function makeRequest(options: {
  token?: string;
  rawAuthHeader?: string;
  body?: unknown;
  rawBody?: string;
}): Request {
  const headers = new Headers({ "content-type": "application/json" });
  if (options.rawAuthHeader !== undefined) {
    headers.set("authorization", options.rawAuthHeader);
  } else if (options.token !== undefined) {
    headers.set("authorization", `Bearer ${options.token}`);
  }
  return new Request(
    "http://localhost:3000/api/gateway/openrouter/chat/completions",
    {
      method: "POST",
      headers,
      body: options.rawBody ?? JSON.stringify(options.body ?? {}),
    },
  );
}

function makeModelsRequest(token?: string): Request {
  const headers = new Headers();
  if (token !== undefined) headers.set("authorization", `Bearer ${token}`);
  return new Request("http://localhost:3000/api/gateway/openrouter/models", {
    headers,
  });
}

function sseUpstream(chunks: string[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "content-type": "text/event-stream; charset=utf-8" },
  });
}

async function importPost() {
  const mod = await import("./chat/completions/route");
  return mod.POST;
}

async function importGet() {
  const mod = await import("./models/route");
  return mod.GET;
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.OPENROUTER_API_KEY = FAKE_KEY;
  // Defaults: valid session, no team, unrestricted models, budget OK.
  getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
  getUserPrimaryTeamIdMock.mockResolvedValue("team-1");
  resolveTeamModelAllowListMock.mockResolvedValue(null);
  getOrgBaseModelAllowListMock.mockResolvedValue(null);
  getUserModelGrantsMock.mockResolvedValue([]);
  checkBudgetMock.mockResolvedValue({ allowed: true });
  recordUsageMock.mockResolvedValue(undefined);
  writeAuditLogMock.mockResolvedValue(undefined);
});

afterEach(() => {
  delete process.env.OPENROUTER_API_KEY;
});

describe("POST /api/gateway/openrouter/chat/completions — auth", () => {
  it("401 when no Authorization header is sent", async () => {
    const POST = await importPost();
    const res = await POST(makeRequest({ body: { model: "gpt-5.5" } }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("unauthorized");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("401 when the Authorization header is not a Bearer token", async () => {
    const POST = await importPost();
    const res = await POST(
      makeRequest({ rawAuthHeader: "Basic dXNlcjpwYXNz", body: {} }),
    );
    expect(res.status).toBe(401);
    expect(getSessionMock).not.toHaveBeenCalled();
  });

  it("401 when the session token does not resolve to a session", async () => {
    getSessionMock.mockResolvedValue(null);
    const POST = await importPost();
    const res = await POST(
      makeRequest({ token: TOKEN, body: { model: "gpt-5.5" } }),
    );
    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("401 for cookie-injection tokens (e.g. containing ';') without calling better-auth", async () => {
    const POST = await importPost();
    const res = await POST(
      makeRequest({ token: "abc; better-auth.session_token=evil", body: {} }),
    );
    expect(res.status).toBe(401);
    expect(getSessionMock).not.toHaveBeenCalled();
  });

  it("validates the bearer token as a session cookie under both cookie names", async () => {
    fetchMock.mockResolvedValue(
      Response.json({ choices: [], usage: null }, { status: 200 }),
    );
    const POST = await importPost();
    await POST(makeRequest({ token: TOKEN, body: { model: "gpt-5.5" } }));
    expect(getSessionMock).toHaveBeenCalledTimes(1);
    const arg = getSessionMock.mock.calls[0][0] as { headers: Headers };
    const cookie = arg.headers.get("cookie") ?? "";
    expect(cookie).toContain(`better-auth.session_token=${TOKEN}`);
    expect(cookie).toContain(`__Secure-better-auth.session_token=${TOKEN}`);
  });
});

describe("POST /api/gateway/openrouter/chat/completions — entitlements", () => {
  it("403 when the model is not on the approved short list", async () => {
    const POST = await importPost();
    const res = await POST(
      makeRequest({ token: TOKEN, body: { model: "made-up-model" } }),
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe("model_not_allowed");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("403 when the model is outside the team allow-list and no grant exists", async () => {
    resolveTeamModelAllowListMock.mockResolvedValue(["gemini-3.5-flash"]);
    const POST = await importPost();
    const res = await POST(
      makeRequest({ token: TOKEN, body: { model: "claude-opus-4.8" } }),
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe("model_not_allowed");
    expect(body.error.message).toContain("claude-opus-4.8");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("allows a restricted model when the user holds a personal grant", async () => {
    resolveTeamModelAllowListMock.mockResolvedValue(["gemini-3.5-flash"]);
    getUserModelGrantsMock.mockResolvedValue(["claude-opus-4.8"]);
    fetchMock.mockResolvedValue(
      Response.json({ choices: [], usage: null }, { status: 200 }),
    );
    const POST = await importPost();
    const res = await POST(
      makeRequest({ token: TOKEN, body: { model: "claude-opus-4.8" } }),
    );
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("accepts the OpenRouter slug alias and forwards the slug upstream", async () => {
    resolveTeamModelAllowListMock.mockResolvedValue(["gpt-5.5"]);
    fetchMock.mockResolvedValue(
      Response.json({ choices: [], usage: null }, { status: 200 }),
    );
    const POST = await importPost();
    const res = await POST(
      makeRequest({ token: TOKEN, body: { model: "openai/gpt-5.5" } }),
    );
    expect(res.status).toBe(200);
    const upstreamBody = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(upstreamBody.model).toBe("openai/gpt-5.5");
  });

  it("uses the org base allow-list when the user has no team", async () => {
    getUserPrimaryTeamIdMock.mockResolvedValue(null);
    getOrgBaseModelAllowListMock.mockResolvedValue(["gemini-3.1-flash-lite"]);
    const POST = await importPost();
    const res = await POST(
      makeRequest({ token: TOKEN, body: { model: "gpt-5.5" } }),
    );
    expect(res.status).toBe(403);
    expect(resolveTeamModelAllowListMock).not.toHaveBeenCalled();
    expect(getOrgBaseModelAllowListMock).toHaveBeenCalled();
  });
});

describe("POST /api/gateway/openrouter/chat/completions — budget", () => {
  it("402 when the budget check blocks, without contacting OpenRouter", async () => {
    checkBudgetMock.mockResolvedValue({
      allowed: false,
      reason: "Team budget exhausted",
    });
    const POST = await importPost();
    const res = await POST(
      makeRequest({ token: TOKEN, body: { model: "gpt-5.5" } }),
    );
    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.error.code).toBe("budget_exhausted");
    expect(body.error.message).toBe("Team budget exhausted");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/gateway/openrouter/chat/completions — proxy (non-stream)", () => {
  it("forwards the body with the server key, relays the JSON, and records usage", async () => {
    const upstreamJson = {
      id: "gen-1",
      choices: [{ message: { role: "assistant", content: "hi" } }],
      usage: { prompt_tokens: 100, completion_tokens: 40 },
    };
    fetchMock.mockResolvedValue(Response.json(upstreamJson, { status: 200 }));

    const POST = await importPost();
    const res = await POST(
      makeRequest({
        token: TOKEN,
        body: { model: "gpt-5.5", messages: [{ role: "user", content: "x" }] },
      }),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(upstreamJson);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
    const headers = init.headers as Record<string, string>;
    expect(headers.authorization).toBe(`Bearer ${FAKE_KEY}`);
    // the client's session token is never forwarded upstream
    expect(JSON.stringify(init.headers)).not.toContain(TOKEN);
    const sentBody = JSON.parse(init.body as string);
    expect(sentBody.model).toBe("openai/gpt-5.5");

    expect(recordUsageMock).toHaveBeenCalledTimes(1);
    const usage = recordUsageMock.mock.calls[0][0];
    expect(usage).toMatchObject({
      userId: "user-1",
      teamId: "team-1",
      model: "gpt-5.5",
      provider: "openRouter",
      promptTokens: 100,
      completionTokens: 40,
    });
    // estimateCostUsd (real impl): gpt-5.5 → 100/1M*2.5 + 40/1M*10
    expect(usage.costUsd).toBeCloseTo(
      (100 / 1_000_000) * 2.5 + (40 / 1_000_000) * 10,
      12,
    );
  });

  it("writes a gateway_completion audit event without prompt content", async () => {
    fetchMock.mockResolvedValue(
      Response.json({ choices: [], usage: null }, { status: 200 }),
    );
    const POST = await importPost();
    await POST(
      makeRequest({
        token: TOKEN,
        body: {
          model: "gpt-5.5",
          messages: [{ role: "user", content: "TOP SECRET PROMPT" }],
        },
      }),
    );
    expect(writeAuditLogMock).toHaveBeenCalledTimes(1);
    const event = writeAuditLogMock.mock.calls[0][0];
    expect(event).toMatchObject({
      userId: "user-1",
      teamId: "team-1",
      eventType: "gateway_completion",
      actorType: "human",
      details: { model: "gpt-5.5", originSurface: "opencode", stream: false },
    });
    expect(JSON.stringify(event)).not.toContain("TOP SECRET PROMPT");
  });

  it("400 on a non-JSON request body", async () => {
    const POST = await importPost();
    const res = await POST(
      makeRequest({ token: TOKEN, rawBody: "this is not json" }),
    );
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/gateway/openrouter/chat/completions — upstream errors", () => {
  it("relays the upstream status and message without leaking the API key", async () => {
    fetchMock.mockResolvedValue(
      Response.json(
        { error: { message: `Rate limited (key ${FAKE_KEY})` } },
        { status: 429 },
      ),
    );
    const POST = await importPost();
    const res = await POST(
      makeRequest({ token: TOKEN, body: { model: "gpt-5.5" } }),
    );
    expect(res.status).toBe(429);
    const text = await res.text();
    expect(text).not.toContain(FAKE_KEY);
    expect(text).toContain("[redacted]");
    const body = JSON.parse(text);
    expect(body.error.code).toBe("upstream_error");
    expect(recordUsageMock).not.toHaveBeenCalled();
    expect(writeAuditLogMock).not.toHaveBeenCalled();
  });

  it("502 with no key leakage when OpenRouter is unreachable", async () => {
    fetchMock.mockRejectedValue(
      new Error(`connect ECONNREFUSED while using ${FAKE_KEY}`),
    );
    const POST = await importPost();
    const res = await POST(
      makeRequest({ token: TOKEN, body: { model: "gpt-5.5" } }),
    );
    expect(res.status).toBe(502);
    const text = await res.text();
    expect(text).not.toContain(FAKE_KEY);
    expect(JSON.parse(text).error.code).toBe("upstream_unreachable");
  });

  it("503 gateway_not_configured when OPENROUTER_API_KEY is absent", async () => {
    delete process.env.OPENROUTER_API_KEY;
    const POST = await importPost();
    const res = await POST(
      makeRequest({ token: TOKEN, body: { model: "gpt-5.5" } }),
    );
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error.code).toBe("gateway_not_configured");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/gateway/openrouter/chat/completions — streaming", () => {
  it("passes SSE bytes through unchanged and records usage from the final chunk", async () => {
    const usageChunk = `data: {"id":"gen-1","choices":[],"usage":{"prompt_tokens":12,"completion_tokens":7}}\n\n`;
    const chunks = [
      `data: {"id":"gen-1","choices":[{"delta":{"content":"Hel"}}]}\n\n`,
      `data: {"id":"gen-1","choices":[{"delta":{"content":"lo"}}]}\n\n`,
      // split the usage event across two network chunks to exercise buffering
      usageChunk.slice(0, 30),
      usageChunk.slice(30),
      `data: [DONE]\n\n`,
    ];
    fetchMock.mockResolvedValue(sseUpstream(chunks));

    const POST = await importPost();
    const res = await POST(
      makeRequest({
        token: TOKEN,
        body: { model: "gpt-5.5", stream: true, messages: [] },
      }),
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    expect(await res.text()).toBe(chunks.join(""));

    expect(recordUsageMock).toHaveBeenCalledTimes(1);
    expect(recordUsageMock.mock.calls[0][0]).toMatchObject({
      model: "gpt-5.5",
      promptTokens: 12,
      completionTokens: 7,
    });
    expect(writeAuditLogMock).toHaveBeenCalledTimes(1);
    expect(writeAuditLogMock.mock.calls[0][0].details.stream).toBe(true);
  });

  it("forces stream_options.include_usage on the upstream request", async () => {
    fetchMock.mockResolvedValue(sseUpstream([`data: [DONE]\n\n`]));
    const POST = await importPost();
    await POST(
      makeRequest({
        token: TOKEN,
        body: { model: "gpt-5.5", stream: true },
      }),
    );
    const sentBody = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(sentBody.stream).toBe(true);
    expect(sentBody.stream_options).toEqual({ include_usage: true });
  });

  it("does not record usage when the stream carries no usage chunk", async () => {
    fetchMock.mockResolvedValue(
      sseUpstream([
        `data: {"id":"gen-1","choices":[{"delta":{"content":"hi"}}]}\n\n`,
        `data: [DONE]\n\n`,
      ]),
    );
    const POST = await importPost();
    const res = await POST(
      makeRequest({ token: TOKEN, body: { model: "gpt-5.5", stream: true } }),
    );
    await res.text();
    expect(recordUsageMock).not.toHaveBeenCalled();
  });
});

describe("GET /api/gateway/openrouter/models", () => {
  it("401 without a bearer token", async () => {
    const GET = await importGet();
    const res = await GET(makeModelsRequest());
    expect(res.status).toBe(401);
  });

  it("returns the full approved short list when entitlements are unrestricted", async () => {
    const GET = await importGet();
    const res = await GET(makeModelsRequest(TOKEN));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.object).toBe("list");
    expect(body.data.map((m: { id: string }) => m.id).sort()).toEqual(
      [
        "claude-opus-4.8",
        "gemini-3.5-flash",
        "gemini-3.1-flash-lite",
        "gpt-5.5",
        "minimax-m3",
        "kimi-k2.5",
        "deepseek-v4-flash",
      ].sort(),
    );
    for (const m of body.data) {
      expect(m).toMatchObject({ object: "model" });
      expect(typeof m.name).toBe("string");
    }
  });

  it("filters by team allow-list and unions per-user grants", async () => {
    resolveTeamModelAllowListMock.mockResolvedValue(["gemini-3.5-flash"]);
    getUserModelGrantsMock.mockResolvedValue(["claude-opus-4.8"]);
    const GET = await importGet();
    const res = await GET(makeModelsRequest(TOKEN));
    const body = await res.json();
    expect(body.data.map((m: { id: string }) => m.id).sort()).toEqual([
      "claude-opus-4.8",
      "gemini-3.5-flash",
    ]);
  });
});
