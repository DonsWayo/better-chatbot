import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Chainable SELECT mock for Drizzle:
//   db.select({...}).from(T).where(...).limit(1) → Promise<row[]>
// ---------------------------------------------------------------------------

let _selectRows: unknown[] = [];

const limitMock = vi.fn().mockImplementation(() => Promise.resolve(_selectRows));
const whereMock = vi.fn().mockReturnValue({ limit: limitMock });
const fromMock = vi.fn().mockReturnValue({ where: whereMock });
const selectMock = vi.fn().mockReturnValue({ from: fromMock });

vi.mock("lib/db/pg/db.pg", () => ({
  pgDb: {
    select: selectMock,
  },
}));

vi.mock("@/lib/db/pg/schema.pg", () => ({
  AsafeTeamTable: { id: "id", name: "name", slug: "slug", description: "description", createdAt: "createdAt" },
  AsafeTeamMemberTable: { id: "id", teamId: "teamId", userId: "userId", role: "role", createdAt: "createdAt" },
  AsafeTeamBudgetTable: { teamId: "teamId", budgetUsd: "budgetUsd", usedUsd: "usedUsd" },
  AsafeUsageEventTable: { model: "model", provider: "provider", promptTokens: "promptTokens", completionTokens: "completionTokens", costUsd: "costUsd", taskClass: "taskClass", createdAt: "createdAt" },
  UserTable: { id: "id", name: "name", email: "email" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((_a: unknown, _b: unknown) => ({})),
  sql: Object.assign(vi.fn(() => ({})), { raw: vi.fn(() => ({})) }),
  gte: vi.fn((_a: unknown, _b: unknown) => ({})),
  desc: vi.fn((_a: unknown) => ({})),
}));

vi.mock("server-only", () => ({}));

describe("getUserPrimaryTeamId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _selectRows = [];

    // Re-wire chain after clearAllMocks
    limitMock.mockImplementation(() => Promise.resolve(_selectRows));
    whereMock.mockReturnValue({ limit: limitMock });
    fromMock.mockReturnValue({ where: whereMock });
    selectMock.mockReturnValue({ from: fromMock });

    // Reset module so the internal _teamIdCache Map is fresh for each test
    vi.resetModules();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.resetModules();
  });

  it("returns teamId when DB has a team member row", async () => {
    _selectRows = [{ teamId: "team-abc" }];
    limitMock.mockResolvedValue(_selectRows);

    const { getUserPrimaryTeamId } = await import("./teams");
    const result = await getUserPrimaryTeamId("user-1");
    expect(result).toBe("team-abc");
  });

  it("returns null when DB returns an empty array", async () => {
    _selectRows = [];
    limitMock.mockResolvedValue([]);

    const { getUserPrimaryTeamId } = await import("./teams");
    const result = await getUserPrimaryTeamId("user-no-team");
    expect(result).toBeNull();
  });

  it("returns null on DB error (fail-open — catch swallows the error)", async () => {
    limitMock.mockRejectedValue(new Error("DB is down"));

    const { getUserPrimaryTeamId } = await import("./teams");
    const result = await getUserPrimaryTeamId("user-err");
    expect(result).toBeNull();
  });

  it("second call within 60s returns cached value (DB called only once)", async () => {
    _selectRows = [{ teamId: "team-cached" }];
    limitMock.mockResolvedValue(_selectRows);

    const { getUserPrimaryTeamId } = await import("./teams");

    const first = await getUserPrimaryTeamId("user-cache");
    const second = await getUserPrimaryTeamId("user-cache");

    expect(first).toBe("team-cached");
    expect(second).toBe("team-cached");
    // Drizzle chain was driven: selectMock should have been called exactly once
    expect(selectMock).toHaveBeenCalledTimes(1);
  });

  it("after 61000ms the next call hits DB again (TTL expired)", async () => {
    vi.useFakeTimers();
    const t0 = new Date("2026-01-01T00:00:00.000Z").getTime();
    vi.setSystemTime(t0);

    _selectRows = [{ teamId: "team-ttl" }];
    limitMock.mockResolvedValue(_selectRows);

    const { getUserPrimaryTeamId } = await import("./teams");

    // First call — primes the cache
    await getUserPrimaryTeamId("user-ttl");
    expect(selectMock).toHaveBeenCalledTimes(1);

    // Advance past the 60 s TTL
    vi.setSystemTime(t0 + 61_000);

    // Second call — cache expired, DB hit again
    await getUserPrimaryTeamId("user-ttl");
    expect(selectMock).toHaveBeenCalledTimes(2);
  });
});
