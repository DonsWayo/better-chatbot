import { describe, it, expect, vi, beforeEach } from "vitest";

// Hoist mocks so they can be referenced in vi.mock factories
const { mockSelect, mockGetSession } = vi.hoisted(() => ({
  mockSelect: vi.fn(),
  mockGetSession: vi.fn(),
}));

vi.mock("lib/db/pg/db.pg", () => ({ pgDb: { select: mockSelect } }));
vi.mock("lib/db/pg/schema.pg", () => ({
  AsafeTeamBudgetTable: { periodEnd: "period_end", teamId: "team_id", budgetUsd: "budget_usd", usedUsd: "used_usd", periodStart: "period_start" },
  AsafeTeamMemberTable: { userId: "user_id", teamId: "team_id" },
  AsafeUsageEventTable: { userId: "user_id", createdAt: "created_at", model: "model", provider: "provider" },
}));
vi.mock("drizzle-orm", () => ({
  and: (...args: unknown[]) => args,
  eq: (a: unknown, b: unknown) => ({ eq: [a, b] }),
  gte: (a: unknown, b: unknown) => ({ gte: [a, b] }),
  sql: Object.assign((strings: TemplateStringsArray) => strings.join(""), {
    raw: (s: string) => s,
  }),
}));
vi.mock("lib/auth/server", () => ({ getSession: mockGetSession }));

// Helper to chain .from().where().groupBy().orderBy().limit()
function makeMockChain(result: unknown[]) {
  const chain: Record<string, unknown> = {};
  const methods = ["from", "where", "groupBy", "orderBy", "limit", "innerJoin"];
  for (const m of methods) {
    chain[m] = vi.fn(() => chain);
  }
  // Make it thenable so await works
  chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve);
  return chain;
}

beforeEach(() => {
  vi.clearAllMocks();
});

import { GET } from "./route";

describe("GET /api/user/usage", () => {
  it("returns 401 when unauthenticated", async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns usage summary with zero values when no events", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1" } });

    // summary query → single row with zeros
    const summaryChain = makeMockChain([
      { totalCostUsd: "0", promptTokens: 0, completionTokens: 0, requestCount: 0 },
    ]);
    // byModel query → empty
    const byModelChain = makeMockChain([]);
    // team member query → no membership
    const memberChain = makeMockChain([]);

    mockSelect
      .mockReturnValueOnce(summaryChain) // summary
      .mockReturnValueOnce(byModelChain) // byModel
      .mockReturnValueOnce(memberChain); // team member

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.summary.totalCostUsd).toBe("0");
    expect(body.summary.requestCount).toBe(0);
    expect(body.byModel).toHaveLength(0);
    expect(body.budget).toBeNull();
  });

  it("returns usage summary with real data", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1" } });

    const summaryChain = makeMockChain([
      { totalCostUsd: "1.234567", promptTokens: 10000, completionTokens: 2000, requestCount: 15 },
    ]);
    const byModelChain = makeMockChain([
      { model: "gemini-2.5-flash", provider: "openrouter", costUsd: "0.8", promptTokens: 8000, completionTokens: 1600, requestCount: 10 },
      { model: "gpt-5.1", provider: "openrouter", costUsd: "0.434567", promptTokens: 2000, completionTokens: 400, requestCount: 5 },
    ]);
    const memberChain = makeMockChain([]);

    mockSelect
      .mockReturnValueOnce(summaryChain)
      .mockReturnValueOnce(byModelChain)
      .mockReturnValueOnce(memberChain);

    const res = await GET();
    const body = await res.json();
    expect(body.summary.requestCount).toBe(15);
    expect(body.byModel).toHaveLength(2);
    expect(body.byModel[0].model).toBe("gemini-2.5-flash");
    expect(body.budget).toBeNull();
  });

  it("includes budget when user has an active team budget", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1" } });

    const summaryChain = makeMockChain([
      { totalCostUsd: "2.5", promptTokens: 50000, completionTokens: 10000, requestCount: 30 },
    ]);
    const byModelChain = makeMockChain([]);
    const memberChain = makeMockChain([{ teamId: "team-1" }]);
    const budgetChain = makeMockChain([
      {
        budgetUsd: "10.00",
        usedUsd: "2.5",
        periodStart: new Date("2026-06-01"),
        periodEnd: new Date("2026-06-30"),
      },
    ]);

    mockSelect
      .mockReturnValueOnce(summaryChain)
      .mockReturnValueOnce(byModelChain)
      .mockReturnValueOnce(memberChain)
      .mockReturnValueOnce(budgetChain);

    const res = await GET();
    const body = await res.json();
    expect(body.budget).not.toBeNull();
    expect(body.budget.budgetUsd).toBe("10.00");
    expect(body.budget.usedUsd).toBe("2.5");
    expect(body.budget.pct).toBe(25);
    expect(body.budget.periodStart).toContain("2026-06-01");
  });

  it("returns null budget when no team membership", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1" } });

    mockSelect
      .mockReturnValueOnce(makeMockChain([{ totalCostUsd: "0", promptTokens: 0, completionTokens: 0, requestCount: 0 }]))
      .mockReturnValueOnce(makeMockChain([]))
      .mockReturnValueOnce(makeMockChain([]));

    const res = await GET();
    const body = await res.json();
    expect(body.budget).toBeNull();
  });

  it("returns null budget when team has no active budget period", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1" } });

    mockSelect
      .mockReturnValueOnce(makeMockChain([{ totalCostUsd: "0", promptTokens: 0, completionTokens: 0, requestCount: 0 }]))
      .mockReturnValueOnce(makeMockChain([]))
      .mockReturnValueOnce(makeMockChain([{ teamId: "team-1" }]))
      .mockReturnValueOnce(makeMockChain([])); // no active budget

    const res = await GET();
    const body = await res.json();
    expect(body.budget).toBeNull();
  });

  it("computes budget pct = 0 when budgetUsd = 0", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1" } });

    mockSelect
      .mockReturnValueOnce(makeMockChain([{ totalCostUsd: "0", promptTokens: 0, completionTokens: 0, requestCount: 0 }]))
      .mockReturnValueOnce(makeMockChain([]))
      .mockReturnValueOnce(makeMockChain([{ teamId: "team-1" }]))
      .mockReturnValueOnce(makeMockChain([{
        budgetUsd: "0",
        usedUsd: "0",
        periodStart: new Date("2026-06-01"),
        periodEnd: new Date("2026-06-30"),
      }]));

    const res = await GET();
    const body = await res.json();
    expect(body.budget.pct).toBe(0);
  });

  it("returns 200 with correct Content-Type JSON", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1" } });

    mockSelect
      .mockReturnValueOnce(makeMockChain([{ totalCostUsd: "0", promptTokens: 0, completionTokens: 0, requestCount: 0 }]))
      .mockReturnValueOnce(makeMockChain([]))
      .mockReturnValueOnce(makeMockChain([]));

    const res = await GET();
    expect(res.status).toBe(200);
  });
});
