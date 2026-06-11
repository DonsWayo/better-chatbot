import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Drizzle mock chain ────────────────────────────────────────────────────────
// canManageTeam issues two point reads (user role, team-member role) via
// select().from().where().limit(1) — fed from a FIFO queue so each call gets
// its own rows. delete()/update() chains record their where() condition so the
// team-scoping tests can assert on it.

const h = vi.hoisted(() => {
  const state = {
    selectQueue: [] as unknown[][],
    selectThrows: false,
  };

  const limitMock = vi.fn(() => {
    if (state.selectThrows) return Promise.reject(new Error("db down"));
    return Promise.resolve(state.selectQueue.shift() ?? []);
  });
  const whereMock = vi.fn(() => ({ limit: limitMock }));
  const fromMock = vi.fn(() => ({ where: whereMock }));
  const selectMock = vi.fn(() => ({ from: fromMock }));

  const deleteWhereMock = vi.fn().mockResolvedValue(undefined);
  const deleteMock = vi.fn(() => ({ where: deleteWhereMock }));

  const updateWhereMock = vi.fn().mockResolvedValue(undefined);
  const updateSetMock = vi.fn(() => ({ where: updateWhereMock }));
  const updateMock = vi.fn(() => ({ set: updateSetMock }));

  return {
    state,
    selectMock,
    deleteMock,
    deleteWhereMock,
    updateMock,
    updateSetMock,
    updateWhereMock,
  };
});

vi.mock("lib/db/pg/db.pg", () => ({
  pgDb: {
    select: h.selectMock,
    delete: h.deleteMock,
    update: h.updateMock,
    insert: vi.fn(),
  },
}));

vi.mock("@/lib/db/pg/schema.pg", () => ({
  AsafeTeamTable: { id: "id" },
  AsafeTeamMemberTable: {
    id: "id",
    teamId: "teamId",
    userId: "userId",
    role: "role",
  },
  AsafeTeamBudgetTable: { teamId: "teamId" },
  AsafeUsageEventTable: { model: "model" },
  UserTable: { id: "id", role: "role" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((col: unknown, value: unknown) => ({ eq: [col, value] })),
  and: vi.fn((...conds: unknown[]) => ({ and: conds })),
  gte: vi.fn(() => ({})),
  lte: vi.fn(() => ({})),
  desc: vi.fn(() => ({})),
  sql: Object.assign(
    vi.fn(() => ({})),
    { raw: vi.fn(() => ({})) },
  ),
}));

import {
  canManageTeam,
  isTeamAdmin,
  removeTeamMember,
  updateTeamMemberRole,
} from "./teams";

beforeEach(() => {
  vi.clearAllMocks();
  h.state.selectQueue = [];
  h.state.selectThrows = false;
});

describe("isTeamAdmin", () => {
  it("true when team_member.role is 'admin'", async () => {
    h.state.selectQueue = [[{ role: "admin" }]];
    await expect(isTeamAdmin("u1", "t1")).resolves.toBe(true);
  });

  it("false for 'editor' and 'member' team roles", async () => {
    h.state.selectQueue = [[{ role: "editor" }]];
    await expect(isTeamAdmin("u1", "t1")).resolves.toBe(false);
    h.state.selectQueue = [[{ role: "member" }]];
    await expect(isTeamAdmin("u1", "t1")).resolves.toBe(false);
  });

  it("false when not a member of the team", async () => {
    h.state.selectQueue = [[]];
    await expect(isTeamAdmin("u1", "t1")).resolves.toBe(false);
  });

  it("fails closed on db error", async () => {
    h.state.selectThrows = true;
    await expect(isTeamAdmin("u1", "t1")).resolves.toBe(false);
  });
});

describe("canManageTeam matrix", () => {
  // Queue order: [user-role row], then [team-member row] (Promise.all builds
  // the user-role chain first, then isTeamAdmin's).
  const cases: Array<{
    name: string;
    userRole: string | null;
    teamRole: string | null;
    expected: boolean;
  }> = [
    {
      name: "global admin, not a team member → true",
      userRole: "admin",
      teamRole: null,
      expected: true,
    },
    {
      name: "global admin in comma-separated roles → true",
      userRole: "admin,user",
      teamRole: null,
      expected: true,
    },
    {
      name: "global editor with team role 'admin' → true",
      userRole: "editor",
      teamRole: "admin",
      expected: true,
    },
    {
      name: "plain user with team role 'admin' → true",
      userRole: "user",
      teamRole: "admin",
      expected: true,
    },
    {
      name: "plain user with team role 'editor' → false",
      userRole: "user",
      teamRole: "editor",
      expected: false,
    },
    {
      name: "plain user with team role 'member' → false",
      userRole: "user",
      teamRole: "member",
      expected: false,
    },
    {
      name: "plain user, not a member → false",
      userRole: "user",
      teamRole: null,
      expected: false,
    },
    {
      name: "unknown user (no row) and no membership → false",
      userRole: null,
      teamRole: null,
      expected: false,
    },
  ];

  for (const c of cases) {
    it(c.name, async () => {
      h.state.selectQueue = [
        c.userRole === null ? [] : [{ role: c.userRole }],
        c.teamRole === null ? [] : [{ role: c.teamRole }],
      ];
      await expect(canManageTeam("u1", "t1")).resolves.toBe(c.expected);
    });
  }

  it("fails closed (false) when the db is unreachable", async () => {
    h.state.selectThrows = true;
    await expect(canManageTeam("u1", "t1")).resolves.toBe(false);
  });
});

describe("team-scoped member mutations (defense in depth)", () => {
  it("removeTeamMember constrains by teamId when provided", async () => {
    await removeTeamMember("m1", "t1");
    const cond = h.deleteWhereMock.mock.calls[0][0] as { and?: unknown[] };
    expect(cond.and).toHaveLength(2);
  });

  it("removeTeamMember without teamId deletes by id only (legacy callers)", async () => {
    await removeTeamMember("m1");
    const cond = h.deleteWhereMock.mock.calls[0][0] as Record<string, unknown>;
    expect(cond.and).toBeUndefined();
    expect(cond.eq).toBeDefined();
  });

  it("updateTeamMemberRole constrains by teamId when provided", async () => {
    await updateTeamMemberRole("m1", "editor", "t1");
    expect(h.updateSetMock).toHaveBeenCalledWith({ role: "editor" });
    const cond = h.updateWhereMock.mock.calls[0][0] as { and?: unknown[] };
    expect(cond.and).toHaveLength(2);
  });
});
