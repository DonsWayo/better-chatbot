import { describe, it, expect, vi, beforeEach } from "vitest";

// getDashboardStats runs 6 queries via Promise.all with mixed chain patterns:
//   select().from(T)             — no .where()
//   select().from(T).where(cond) — with .where()
// We need from() to return something that is BOTH awaitable AND has .where().

function makePseudoQuery(rows: unknown[]) {
  // Creates a thenable (awaitable) object that also has a .where() method
  const p = Promise.resolve(rows) as Promise<unknown[]> & { where: () => Promise<unknown[]> };
  p.where = vi.fn().mockResolvedValue(rows);
  return p;
}

const selectMock = vi.fn();
vi.mock("lib/db/pg/db.pg", () => ({
  pgDb: { select: selectMock },
}));

vi.mock("@/lib/db/pg/schema.pg", () => ({
  UserTable: {},
  AsafeTeamTable: {},
  AsafeUsageEventTable: { costUsd: "costUsd", createdAt: "createdAt" },
  AsafeGuardrailEventTable: { createdAt: "createdAt" },
  AsafeTeamBudgetTable: { periodStart: "periodStart", periodEnd: "periodEnd", budgetUsd: "budgetUsd", usedUsd: "usedUsd" },
}));

vi.mock("drizzle-orm", () => ({
  sql: Object.assign(vi.fn(() => ({})), { raw: vi.fn(() => ({})) }),
  gte: vi.fn(() => ({})),
  lte: vi.fn(() => ({})),
  and: vi.fn(() => ({})),
}));

vi.mock("server-only", () => ({}));

function setupMocks(results: unknown[][]) {
  let call = 0;
  selectMock.mockImplementation(() => ({
    from: vi.fn().mockImplementation(() => {
      const rows = results[call++] ?? [];
      return makePseudoQuery(rows);
    }),
  }));
}

describe("getDashboardStats", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("returns all expected keys", async () => {
    setupMocks([
      [{ total: 0 }], [{ total: 0 }],
      [{ requests: 0, costUsd: null }], [{ requests: 0, costUsd: null }],
      [{ total: 0 }], [],
    ]);

    const { getDashboardStats } = await import("./dashboard");
    const stats = await getDashboardStats();

    expect(stats).toHaveProperty("totalUsers");
    expect(stats).toHaveProperty("totalTeams");
    expect(stats).toHaveProperty("requestsLast24h");
    expect(stats).toHaveProperty("costLast24hUsd");
    expect(stats).toHaveProperty("requestsLast7d");
    expect(stats).toHaveProperty("costLast7dUsd");
    expect(stats).toHaveProperty("guardrailFiringsLast24h");
    expect(stats).toHaveProperty("budgetsNearLimit");
  });

  it("defaults all numbers to 0 when DB returns empty rows", async () => {
    setupMocks([[], [], [], [], [], []]);

    const { getDashboardStats } = await import("./dashboard");
    const stats = await getDashboardStats();

    expect(stats.totalUsers).toBe(0);
    expect(stats.totalTeams).toBe(0);
    expect(stats.requestsLast24h).toBe(0);
    expect(stats.costLast24hUsd).toBe(0);
    expect(stats.requestsLast7d).toBe(0);
    expect(stats.guardrailFiringsLast24h).toBe(0);
    expect(stats.budgetsNearLimit).toBe(0);
  });

  it("counts totalUsers and totalTeams from DB", async () => {
    setupMocks([
      [{ total: 42 }], [{ total: 7 }],
      [{ requests: 0, costUsd: null }], [{ requests: 0, costUsd: null }],
      [{ total: 0 }], [],
    ]);

    const { getDashboardStats } = await import("./dashboard");
    const stats = await getDashboardStats();

    expect(stats.totalUsers).toBe(42);
    expect(stats.totalTeams).toBe(7);
  });

  it("parses cost from string to number", async () => {
    setupMocks([
      [{ total: 0 }], [{ total: 0 }],
      [{ requests: 50, costUsd: "1.234567" }],
      [{ requests: 300, costUsd: "8.654321" }],
      [{ total: 0 }], [],
    ]);

    const { getDashboardStats } = await import("./dashboard");
    const stats = await getDashboardStats();

    expect(stats.requestsLast24h).toBe(50);
    expect(stats.costLast24hUsd).toBeCloseTo(1.234567);
    expect(stats.requestsLast7d).toBe(300);
    expect(stats.costLast7dUsd).toBeCloseTo(8.654321);
  });

  it("counts budgets near limit (≥80%)", async () => {
    setupMocks([
      [{ total: 0 }], [{ total: 0 }],
      [{ requests: 0, costUsd: null }], [{ requests: 0, costUsd: null }],
      [{ total: 0 }],
      [
        { budgetUsd: "100.00", usedUsd: "85.00" }, // 85% — near limit
        { budgetUsd: "200.00", usedUsd: "50.00" }, // 25% — OK
        { budgetUsd: "50.00",  usedUsd: "40.00" }, // 80% — exactly at threshold
      ],
    ]);

    const { getDashboardStats } = await import("./dashboard");
    const stats = await getDashboardStats();

    expect(stats.budgetsNearLimit).toBe(2);
  });

  it("counts guardrail firings from DB", async () => {
    setupMocks([
      [{ total: 0 }], [{ total: 0 }],
      [{ requests: 0, costUsd: null }], [{ requests: 0, costUsd: null }],
      [{ total: 12 }], [],
    ]);

    const { getDashboardStats } = await import("./dashboard");
    const stats = await getDashboardStats();

    expect(stats.guardrailFiringsLast24h).toBe(12);
  });

  it("costLast7dUsd defaults to 0 when DB returns null cost", async () => {
    setupMocks([
      [{ total: 0 }], [{ total: 0 }],
      [{ requests: 0, costUsd: null }], [{ requests: 0, costUsd: null }],
      [{ total: 0 }], [],
    ]);
    const { getDashboardStats } = await import("./dashboard");
    const stats = await getDashboardStats();
    expect(stats.costLast7dUsd).toBe(0);
  });

  it("budgetsNearLimit is 0 when no budgets exist", async () => {
    setupMocks([
      [{ total: 0 }], [{ total: 0 }],
      [{ requests: 0, costUsd: null }], [{ requests: 0, costUsd: null }],
      [{ total: 0 }], [],
    ]);
    const { getDashboardStats } = await import("./dashboard");
    const stats = await getDashboardStats();
    expect(stats.budgetsNearLimit).toBe(0);
  });

  it("all numeric fields are finite numbers", async () => {
    setupMocks([
      [{ total: 5 }], [{ total: 3 }],
      [{ requests: 10, costUsd: "0.50" }],
      [{ requests: 100, costUsd: "5.00" }],
      [{ total: 2 }],
      [{ budgetUsd: "100.00", usedUsd: "90.00" }],
    ]);
    const { getDashboardStats } = await import("./dashboard");
    const stats = await getDashboardStats();
    for (const [key, value] of Object.entries(stats)) {
      expect(isFinite(value as number), `${key} should be finite`).toBe(true);
    }
  });
});
