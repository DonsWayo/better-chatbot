import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Tests for the multi-team RESTRICTION resolvers:
//   resolveEffectiveToolPolicy     — AND per-tool flags across ALL the user's teams
//   resolveStrictestGuardrailPolicy — strictest posture across ALL the user's teams
//
// These key off asafe_team_member (every team, no LIMIT) → getTeamPolicy per
// team. We drive the real getTeamPolicy through DB-row mocks. Each test uses
// UNIQUE teamIds to dodge getTeamPolicy's 60s in-process cache.
// ---------------------------------------------------------------------------

const h = vi.hoisted(() => {
  // Mutable test state.
  const state: {
    memberRows: Array<{ teamId: string }>;
    teamPolicyRows: Record<string, unknown>;
    lastTeamId: string | undefined;
    membershipThrows: boolean;
  } = {
    memberRows: [],
    teamPolicyRows: {},
    lastTeamId: undefined,
    membershipThrows: false,
  };

  // eq() captures the queried teamId so the .limit() resolver picks the row.
  const eqMock = vi.fn((_col: unknown, val: unknown) => {
    if (typeof val === "string") state.lastTeamId = val;
    return {};
  });

  // .limit(1) → the team-policy row for the captured teamId.
  const limitMock = vi.fn(() =>
    Promise.resolve(
      state.lastTeamId && state.teamPolicyRows[state.lastTeamId]
        ? [state.teamPolicyRows[state.lastTeamId]]
        : [],
    ),
  );

  // .where() returns a hybrid: awaitable (membership rows) AND `.limit()`able.
  const whereMock = vi.fn(() => {
    if (state.membershipThrows) {
      return {
        limit: limitMock,
        then: (_res: unknown, rej: (e: unknown) => unknown) =>
          rej(new Error("db down")),
      };
    }
    return {
      limit: limitMock,
      then: (res: (v: unknown) => unknown) => res(state.memberRows),
    };
  });
  const fromMock = vi.fn(() => ({ where: whereMock }));
  const selectMock = vi.fn(() => ({ from: fromMock }));

  return { state, eqMock, limitMock, whereMock, fromMock, selectMock };
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
  eq: h.eqMock,
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

// getTeamPolicy dynamically imports ./model-policy to layer the model
// allow-list. Stub it so the per-team policy resolves without a real DB.
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

type TeamRow = {
  guardrailPolicy: string;
  allowImageGen: boolean;
  allowVision: boolean;
  allowSpeech: boolean;
  allowWebSearch: boolean;
  allowCodeExec: boolean;
  allowHttp: boolean;
  modelAllowList: string[] | null;
  modelPolicy: unknown;
  allowedEmailDomains: string[];
};

function teamRow(p: Partial<TeamRow>): TeamRow {
  return {
    guardrailPolicy: "standard",
    allowImageGen: false,
    allowVision: false,
    allowSpeech: false,
    allowWebSearch: true,
    allowCodeExec: true,
    allowHttp: true,
    modelAllowList: null,
    modelPolicy: null,
    allowedEmailDomains: [],
    ...p,
  };
}

let _uid = 0;
/** Build N member rows with globally-unique teamIds (dodges the policy cache). */
function members(policies: Array<Partial<TeamRow>>): Array<{ teamId: string }> {
  const rows: Array<{ teamId: string }> = [];
  h.state.teamPolicyRows = {};
  for (const p of policies) {
    const id = `team-${_uid++}`;
    rows.push({ teamId: id });
    h.state.teamPolicyRows[id] = teamRow(p);
  }
  return rows;
}

beforeEach(async () => {
  vi.clearAllMocks();
  h.state.memberRows = [];
  h.state.teamPolicyRows = {};
  h.state.lastTeamId = undefined;
  h.state.membershipThrows = false;
  // The resolvers now keep a per-user (userId-keyed) TTL cache. Tests reuse the
  // same userId ("u1") across cases, so clear it between tests to force a fresh
  // cross-team resolve (the same reason the suite uses unique teamIds to dodge
  // getTeamPolicy's per-team cache).
  const { clearUserPolicyCaches } = await import("./teams");
  clearUserPolicyCaches();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("resolveEffectiveToolPolicy (AND across all teams)", () => {
  it("single-team, all default-true → unchanged (no restriction)", async () => {
    h.state.memberRows = members([{}]);
    const { resolveEffectiveToolPolicy } = await import("./teams");
    expect(await resolveEffectiveToolPolicy("u1")).toEqual({
      allowWebSearch: true,
      allowCodeExec: true,
      allowHttp: true,
    });
  });

  it("12 default-true teams (the seed `editor` shape) → nothing stripped", async () => {
    h.state.memberRows = members(Array.from({ length: 12 }, () => ({})));
    const { resolveEffectiveToolPolicy } = await import("./teams");
    expect(await resolveEffectiveToolPolicy("editor")).toEqual({
      allowWebSearch: true,
      allowCodeExec: true,
      allowHttp: true,
    });
  });

  it("a tool disabled on ANY team is removed everywhere (logical AND)", async () => {
    h.state.memberRows = members([{}, { allowCodeExec: false }]);
    const { resolveEffectiveToolPolicy } = await import("./teams");
    expect(await resolveEffectiveToolPolicy("u1")).toEqual({
      allowWebSearch: true,
      allowCodeExec: false,
      allowHttp: true,
    });
  });

  it("ANDs every flag independently across teams", async () => {
    h.state.memberRows = members([
      { allowWebSearch: false },
      { allowHttp: false },
      {},
    ]);
    const { resolveEffectiveToolPolicy } = await import("./teams");
    expect(await resolveEffectiveToolPolicy("u1")).toEqual({
      allowWebSearch: false,
      allowCodeExec: true,
      allowHttp: false,
    });
  });

  it("no teams → no restriction (all true)", async () => {
    h.state.memberRows = [];
    const { resolveEffectiveToolPolicy } = await import("./teams");
    expect(await resolveEffectiveToolPolicy("u1")).toEqual({
      allowWebSearch: true,
      allowCodeExec: true,
      allowHttp: true,
    });
  });

  it("fails OPEN (all true) on a DB error — soft control", async () => {
    h.state.membershipThrows = true;
    const { resolveEffectiveToolPolicy } = await import("./teams");
    expect(await resolveEffectiveToolPolicy("u1")).toEqual({
      allowWebSearch: true,
      allowCodeExec: true,
      allowHttp: true,
    });
  });
});

describe("resolveStrictestGuardrailPolicy (strictest across all teams)", () => {
  it("single team → that team's posture", async () => {
    h.state.memberRows = members([{ guardrailPolicy: "permissive" }]);
    const { resolveStrictestGuardrailPolicy } = await import("./teams");
    expect(await resolveStrictestGuardrailPolicy("u1")).toBe("permissive");
  });

  it("strict beats standard beats permissive", async () => {
    h.state.memberRows = members([
      { guardrailPolicy: "permissive" },
      { guardrailPolicy: "standard" },
      { guardrailPolicy: "strict" },
    ]);
    const { resolveStrictestGuardrailPolicy } = await import("./teams");
    expect(await resolveStrictestGuardrailPolicy("u1")).toBe("strict");
  });

  it("standard wins over permissive when no strict team present", async () => {
    h.state.memberRows = members([
      { guardrailPolicy: "permissive" },
      { guardrailPolicy: "standard" },
    ]);
    const { resolveStrictestGuardrailPolicy } = await import("./teams");
    expect(await resolveStrictestGuardrailPolicy("u1")).toBe("standard");
  });

  it("no teams → undefined (caller falls back to org default)", async () => {
    h.state.memberRows = [];
    const { resolveStrictestGuardrailPolicy } = await import("./teams");
    expect(await resolveStrictestGuardrailPolicy("u1")).toBeUndefined();
  });

  it("fails CLOSED to strict on a DB error — hard safety control", async () => {
    h.state.membershipThrows = true;
    const { resolveStrictestGuardrailPolicy } = await import("./teams");
    expect(await resolveStrictestGuardrailPolicy("u1")).toBe("strict");
  });
});
