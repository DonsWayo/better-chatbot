import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockSelect, mockSession } = vi.hoisted(() => ({
  mockSelect: vi.fn(),
  mockSession: vi.fn(),
}));

vi.mock("lib/auth/server", () => ({ getSession: mockSession }));
vi.mock("lib/db/pg/db.pg", () => ({ pgDb: { select: mockSelect } }));
vi.mock("lib/db/pg/schema.pg", () => ({
  AsafeUsageEventTable: { createdAt: "created_at", userId: "user_id", teamId: "team_id", model: "model", provider: "provider", taskClass: "task_class", promptTokens: "prompt_tokens", completionTokens: "completion_tokens", costUsd: "cost_usd" },
  UserTable: { id: "id", email: "email" },
  AsafeTeamTable: { id: "id", name: "name" },
}));
vi.mock("drizzle-orm", () => ({
  and: (...a: unknown[]) => a,
  eq: (a: unknown, b: unknown) => ({ eq: [a, b] }),
  gte: (a: unknown, b: unknown) => ({ gte: [a, b] }),
  desc: (a: unknown) => ({ desc: a }),
}));

function makeChain(result: unknown[]) {
  const chain: Record<string, unknown> = {};
  const methods = ["from", "leftJoin", "where", "orderBy", "limit"];
  for (const m of methods) chain[m] = vi.fn(() => chain);
  chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve);
  return chain;
}

beforeEach(() => vi.clearAllMocks());

import { GET } from "./route";

const adminSession = { user: { id: "admin-1", role: "admin" } };
const regularSession = { user: { id: "user-1", role: "user" } };

function makeRequest(params: Record<string, string> = {}) {
  const url = new URL("http://localhost:3001/api/admin/usage/export");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return { nextUrl: url } as unknown as Parameters<typeof GET>[0];
}

describe("GET /api/admin/usage/export", () => {
  it("returns 401 when unauthenticated", async () => {
    mockSession.mockResolvedValue(null);
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-admin user", async () => {
    mockSession.mockResolvedValue(regularSession);
    const res = await GET(makeRequest());
    expect(res.status).toBe(403);
  });

  it("returns 400 for invalid days parameter", async () => {
    mockSession.mockResolvedValue(adminSession);
    const res = await GET(makeRequest({ days: "abc" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for negative days parameter", async () => {
    mockSession.mockResolvedValue(adminSession);
    const res = await GET(makeRequest({ days: "-5" }));
    expect(res.status).toBe(400);
  });

  it("returns CSV content type", async () => {
    mockSession.mockResolvedValue(adminSession);
    mockSelect.mockReturnValue(makeChain([]));
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/csv");
  });

  it("returns content-disposition attachment header", async () => {
    mockSession.mockResolvedValue(adminSession);
    mockSelect.mockReturnValue(makeChain([]));
    const res = await GET(makeRequest());
    expect(res.headers.get("content-disposition")).toContain("attachment");
    expect(res.headers.get("content-disposition")).toContain(".csv");
  });

  it("returns CSV header row even with no data", async () => {
    mockSession.mockResolvedValue(adminSession);
    mockSelect.mockReturnValue(makeChain([]));
    const res = await GET(makeRequest());
    const text = await res.text();
    expect(text).toContain("timestamp,user_email,team,model,provider");
  });

  it("returns a row per usage event", async () => {
    mockSession.mockResolvedValue(adminSession);
    const row = {
      createdAt: new Date("2026-06-01T10:00:00Z"),
      userEmail: "alice@asafe.example",
      teamName: "Engineering",
      model: "gemini-2.5-flash",
      provider: "openrouter",
      taskClass: "balanced",
      promptTokens: 100,
      completionTokens: 50,
      costUsd: "0.000030",
    };
    mockSelect.mockReturnValue(makeChain([row]));
    const res = await GET(makeRequest());
    const text = await res.text();
    expect(text).toContain("alice@asafe.example");
    expect(text).toContain("Engineering");
    expect(text).toContain("gemini-2.5-flash");
    expect(text).toContain("0.000030");
  });

  it("escapes commas in team names", async () => {
    mockSession.mockResolvedValue(adminSession);
    const row = {
      createdAt: new Date("2026-06-01T10:00:00Z"),
      userEmail: "bob@asafe.example",
      teamName: "Sales, UK",
      model: "gpt-5.1",
      provider: "openrouter",
      taskClass: null,
      promptTokens: 200,
      completionTokens: 100,
      costUsd: "0.000750",
    };
    mockSelect.mockReturnValue(makeChain([row]));
    const res = await GET(makeRequest());
    const text = await res.text();
    expect(text).toContain('"Sales, UK"');
  });

  it("escapes quotes in field values", async () => {
    mockSession.mockResolvedValue(adminSession);
    const row = {
      createdAt: new Date("2026-06-01T10:00:00Z"),
      userEmail: 'alice"s@asafe.example',
      teamName: "Dev",
      model: "gpt-5.1",
      provider: "openrouter",
      taskClass: null,
      promptTokens: 10,
      completionTokens: 5,
      costUsd: "0.000010",
    };
    mockSelect.mockReturnValue(makeChain([row]));
    const res = await GET(makeRequest());
    const text = await res.text();
    expect(text).toContain('""');
  });

  it("caps days at 365", async () => {
    mockSession.mockResolvedValue(adminSession);
    mockSelect.mockReturnValue(makeChain([]));
    const res = await GET(makeRequest({ days: "9999" }));
    expect(res.status).toBe(200);
  });

  it("defaults to 30 days when no days param", async () => {
    mockSession.mockResolvedValue(adminSession);
    mockSelect.mockReturnValue(makeChain([]));
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
  });
});

describe("GET /api/admin/usage/export — guard chains", () => {
  beforeEach(() => vi.clearAllMocks());

  it("never calls mockSelect when unauthenticated", async () => {
    mockSession.mockResolvedValue(null);
    await GET(makeRequest());
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it("never calls mockSelect for non-admin user", async () => {
    mockSession.mockResolvedValue(regularSession);
    await GET(makeRequest());
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it("getSession called exactly once per GET", async () => {
    mockSession.mockResolvedValue(null);
    await GET(makeRequest());
    expect(mockSession).toHaveBeenCalledTimes(1);
  });

  it("401 body has error field when unauthenticated", async () => {
    mockSession.mockResolvedValue(null);
    const res = await GET(makeRequest());
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("403 body has error field for non-admin", async () => {
    mockSession.mockResolvedValue(regularSession);
    const res = await GET(makeRequest());
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("400 body has error field for invalid days param", async () => {
    mockSession.mockResolvedValue(adminSession);
    const res = await GET(makeRequest({ days: "not-a-number" }));
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("mockSelect called exactly once on valid admin request", async () => {
    mockSession.mockResolvedValue(adminSession);
    mockSelect.mockReturnValue(makeChain([]));
    await GET(makeRequest());
    expect(mockSelect).toHaveBeenCalledTimes(1);
  });
});

describe("GET /api/admin/usage/export — response shape", () => {
  beforeEach(() => vi.clearAllMocks());

  it("response is always a Response instance for 401", async () => {
    mockSession.mockResolvedValue(null);
    const res = await GET(makeRequest());
    expect(res).toBeInstanceOf(Response);
  });

  it("response is always a Response instance for 403", async () => {
    mockSession.mockResolvedValue(regularSession);
    const res = await GET(makeRequest());
    expect(res).toBeInstanceOf(Response);
  });

  it("response is always a Response instance for valid admin request", async () => {
    mockSession.mockResolvedValue(adminSession);
    mockSelect.mockReturnValue(makeChain([]));
    const res = await GET(makeRequest());
    expect(res).toBeInstanceOf(Response);
  });

  it("CSV header row has timestamp and model columns", async () => {
    mockSession.mockResolvedValue(adminSession);
    mockSelect.mockReturnValue(makeChain([]));
    const res = await GET(makeRequest());
    const text = await res.text();
    const header = text.split("\n")[0];
    expect(header).toContain("timestamp");
    expect(header).toContain("model");
  });
});
