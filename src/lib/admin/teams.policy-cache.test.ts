import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// TTL-cache behavior for the per-user RESTRICTION resolvers in teams.ts:
//   resolveEffectiveToolPolicy / resolveStrictestGuardrailPolicy
//
// These scan asafe_team_member across ALL the user's teams on every chat
// message, so the result is cached per-userId with a short TTL (mirroring
// _teamPolicyCache). This suite asserts: hit (no second membership scan),
// miss after TTL expiry, and explicit invalidation via clearUserPolicyCaches.
//
// We count membership scans by counting select().from().where() awaits. Each
// resolver does ONE membership scan then a getTeamPolicy per team; we keep the
// user in a SINGLE team so a cache hit means exactly zero extra scans.
// ---------------------------------------------------------------------------

const h = vi.hoisted(() => {
  const state = {
    membershipScans: 0,
    memberRows: [{ teamId: "team-cache-1" }] as Array<{ teamId: string }>,
    teamRow: {
      guardrailPolicy: "strict",
      allowImageGen: false,
      allowVision: false,
      allowSpeech: false,
      allowWebSearch: false, // distinctive non-default so we can assert it
      allowCodeExec: true,
      allowHttp: true,
      modelAllowList: null,
      modelPolicy: null,
      allowedEmailDomains: [],
    } as Record<string, unknown>,
  };

  // .limit(1) → the single team-policy row (getTeamPolicy path).
  const limitMock = vi.fn(() => Promise.resolve([state.teamRow]));

  // .where() is both awaitable (membership rows; counts a scan) and limitable
  // (team-policy single-row lookup).
  const whereMock = vi.fn(() => ({
    limit: limitMock,
    then: (res: (v: unknown) => unknown) => {
      state.membershipScans += 1;
      return res(state.memberRows);
    },
  }));
  const fromMock = vi.fn(() => ({ where: whereMock }));
  const selectMock = vi.fn(() => ({ from: fromMock }));

  return { state, selectMock, whereMock, limitMock };
});

vi.mock("lib/db/pg/db.pg", () => ({
  pgDb: { select: h.selectMock, update: vi.fn(), insert: vi.fn() },
}));

vi.mock("@/lib/db/pg/schema.pg", () => ({
  AsafeTeamTable: {
    id: "id",
    guardrailPolicy: "guardrailPolicy",
    allowImageGen: "allowImageGen",
    allowVision: "allowVision",
    allowSpeech: "allowSpeech",
    allowWebSearch: "allowWebSearch",
    allowCodeExec: "allowCodeExec",
    allowHttp: "allowHttp",
    modelAllowList: "modelAllowList",
    modelPolicy: "modelPolicy",
    allowedEmailDomains: "allowedEmailDomains",
  },
  AsafeTeamMemberTable: { teamId: "teamId", userId: "userId" },
  AsafeTeamBudgetTable: {},
  AsafeUsageEventTable: {},
  UserTable: {},
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(() => ({})),
  sql: Object.assign(
    vi.fn(() => ({})),
    { raw: vi.fn(() => ({})) },
  ),
  gte: vi.fn(() => ({})),
  lte: vi.fn(() => ({})),
  and: vi.fn(() => ({})),
  desc: vi.fn(() => ({})),
}));

vi.mock("server-only", () => ({}));

vi.mock("./model-policy", () => ({
  getOrgBaseModelAllowList: vi.fn(async () => null),
  resolveModelAllowList: vi.fn(() => null),
}));

vi.mock("logger", () => ({
  default: {
    withDefaults: () => ({
      error: vi.fn(),
      warn: vi.fn(),
      info: vi.fn(),
      debug: vi.fn(),
    }),
  },
}));

beforeEach(async () => {
  vi.clearAllMocks();
  vi.useRealTimers();
  h.state.membershipScans = 0;
  const { clearUserPolicyCaches } = await import("./teams");
  clearUserPolicyCaches();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("resolveEffectiveToolPolicy — TTL cache", () => {
  it("MISS then HIT: second call within TTL does not re-scan membership", async () => {
    const { resolveEffectiveToolPolicy } = await import("./teams");

    const first = await resolveEffectiveToolPolicy("cache-user");
    expect(first).toEqual({
      allowWebSearch: false,
      allowCodeExec: true,
      allowHttp: true,
    });
    const scansAfterFirst = h.state.membershipScans;
    expect(scansAfterFirst).toBeGreaterThan(0);

    const second = await resolveEffectiveToolPolicy("cache-user");
    expect(second).toEqual(first);
    // No additional membership scan — served from cache.
    expect(h.state.membershipScans).toBe(scansAfterFirst);
  });

  it("EXPIRY: a call after the TTL re-scans membership", async () => {
    vi.useFakeTimers();
    const { resolveEffectiveToolPolicy } = await import("./teams");

    await resolveEffectiveToolPolicy("cache-user");
    const scansAfterFirst = h.state.membershipScans;

    // Advance past the 30s TTL.
    vi.advanceTimersByTime(31_000);

    await resolveEffectiveToolPolicy("cache-user");
    expect(h.state.membershipScans).toBeGreaterThan(scansAfterFirst);
  });

  it("INVALIDATE: clearUserPolicyCaches forces a fresh scan", async () => {
    const { resolveEffectiveToolPolicy, clearUserPolicyCaches } = await import(
      "./teams"
    );

    await resolveEffectiveToolPolicy("cache-user");
    const scansAfterFirst = h.state.membershipScans;

    clearUserPolicyCaches();

    await resolveEffectiveToolPolicy("cache-user");
    expect(h.state.membershipScans).toBeGreaterThan(scansAfterFirst);
  });

  it("per-key: a different userId is a cache MISS", async () => {
    const { resolveEffectiveToolPolicy } = await import("./teams");

    await resolveEffectiveToolPolicy("user-a");
    const scansAfterA = h.state.membershipScans;

    await resolveEffectiveToolPolicy("user-b");
    expect(h.state.membershipScans).toBeGreaterThan(scansAfterA);
  });
});

describe("resolveStrictestGuardrailPolicy — TTL cache", () => {
  it("MISS then HIT within TTL", async () => {
    const { resolveStrictestGuardrailPolicy } = await import("./teams");

    const first = await resolveStrictestGuardrailPolicy("cache-user");
    expect(first).toBe("strict");
    const scansAfterFirst = h.state.membershipScans;

    const second = await resolveStrictestGuardrailPolicy("cache-user");
    expect(second).toBe("strict");
    expect(h.state.membershipScans).toBe(scansAfterFirst);
  });

  it("EXPIRY re-scans after the TTL", async () => {
    vi.useFakeTimers();
    const { resolveStrictestGuardrailPolicy } = await import("./teams");

    await resolveStrictestGuardrailPolicy("cache-user");
    const scansAfterFirst = h.state.membershipScans;

    vi.advanceTimersByTime(31_000);

    await resolveStrictestGuardrailPolicy("cache-user");
    expect(h.state.membershipScans).toBeGreaterThan(scansAfterFirst);
  });
});
