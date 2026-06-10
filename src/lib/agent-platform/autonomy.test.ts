import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Drizzle mock chain ────────────────────────────────────────────────────────
// All three autonomy layers live in the same asafe_org_settings key-value
// table, so the mock keys rows off the second argument that the (mocked)
// drizzle `eq` captured — i.e. which settings key was queried.

const h = vi.hoisted(() => {
  const state = {
    rowsByKey: {} as Record<string, unknown[]>,
    selectThrows: false,
  };

  let lastKey: string | undefined;
  const eqMock = vi.fn((_col: unknown, value: unknown) => {
    lastKey = String(value);
    return { eq: [_col, value] };
  });

  const fromMock = vi.fn(() => ({
    where: vi.fn(() => ({
      limit: vi.fn(() => {
        if (state.selectThrows) return Promise.reject(new Error("db down"));
        return Promise.resolve(state.rowsByKey[lastKey ?? ""] ?? []);
      }),
    })),
  }));
  const selectMock = vi.fn().mockReturnValue({ from: fromMock });

  const onConflictMock = vi.fn().mockResolvedValue([]);
  const insertValuesMock = vi
    .fn()
    .mockReturnValue({ onConflictDoUpdate: onConflictMock });
  const insertMock = vi.fn().mockReturnValue({ values: insertValuesMock });

  return {
    state,
    eqMock,
    fromMock,
    selectMock,
    onConflictMock,
    insertValuesMock,
    insertMock,
  };
});

const { state, insertValuesMock, onConflictMock } = h;

vi.mock("server-only", () => ({}));

vi.mock("lib/db/pg/db.pg", () => ({
  pgDb: { select: h.selectMock, insert: h.insertMock },
}));

vi.mock("lib/db/pg/schema.pg", () => ({
  AsafeOrgSettingsTable: { key: "key", value: "value" },
}));

vi.mock("drizzle-orm", () => ({ eq: h.eqMock }));

import {
  DEFAULT_AUTONOMY_CAP,
  ORG_AUTONOMY_CAP_KEY,
  clampMode,
  getOrgAutonomyCap,
  resolveAutonomy,
  resolveAutonomyCap,
  setOrgAutonomyCap,
  setTeamAutonomyCap,
  setUserAutonomyCap,
  teamAutonomyCapKey,
  userAutonomyCapKey,
} from "./autonomy";

beforeEach(() => {
  vi.clearAllMocks();
  state.rowsByKey = {};
  state.selectThrows = false;
});

// ── resolveAutonomy (pure layering) ──────────────────────────────────────────

describe("resolveAutonomy", () => {
  it("defaults to interactive when no layer is configured", () => {
    expect(resolveAutonomy(null)).toBe("interactive");
    expect(resolveAutonomy(undefined, null, null)).toBe("interactive");
    expect(DEFAULT_AUTONOMY_CAP).toBe("interactive");
  });

  it("org cap alone sets the effective cap", () => {
    expect(resolveAutonomy("plan")).toBe("plan");
    expect(resolveAutonomy("autopilot")).toBe("autopilot");
  });

  it("a team grant raises above the org default", () => {
    expect(resolveAutonomy(null, "plan")).toBe("plan");
    expect(resolveAutonomy("interactive", "plan")).toBe("plan");
  });

  it("a user grant raises to autopilot", () => {
    expect(resolveAutonomy("interactive", "plan", "autopilot")).toBe(
      "autopilot",
    );
    expect(resolveAutonomy(null, null, "autopilot")).toBe("autopilot");
  });

  it("max wins: lower team/user entries never lower the org cap", () => {
    expect(resolveAutonomy("autopilot", "interactive", "interactive")).toBe(
      "autopilot",
    );
    expect(resolveAutonomy("plan", "interactive")).toBe("plan");
  });
});

// ── clampMode ────────────────────────────────────────────────────────────────

describe("clampMode", () => {
  it("passes a requested mode at or below the cap through", () => {
    expect(clampMode("interactive", "autopilot")).toBe("interactive");
    expect(clampMode("plan", "plan")).toBe("plan");
  });

  it("clamps a requested mode above the cap down to the cap", () => {
    expect(clampMode("autopilot", "plan")).toBe("plan");
    expect(clampMode("plan", "interactive")).toBe("interactive");
  });

  it("interactive is the floor: always allowed under any cap", () => {
    expect(clampMode("interactive", "interactive")).toBe("interactive");
  });
});

// ── resolveAutonomyCap (db-backed) ───────────────────────────────────────────

describe("resolveAutonomyCap", () => {
  it("reads the org, team-scoped and user-scoped settings keys", async () => {
    state.rowsByKey = {
      [ORG_AUTONOMY_CAP_KEY]: [{ value: { cap: "interactive" } }],
      [teamAutonomyCapKey("t1")]: [{ value: { cap: "plan" } }],
      [userAutonomyCapKey("u1")]: [{ value: { cap: "autopilot" } }],
    };
    await expect(
      resolveAutonomyCap({ userId: "u1", teamId: "t1" }),
    ).resolves.toBe("autopilot");

    const queriedKeys = h.eqMock.mock.calls.map((call) => call[1]);
    expect(queriedKeys).toEqual(
      expect.arrayContaining([
        ORG_AUTONOMY_CAP_KEY,
        "team_autonomy_cap:t1",
        "user_autonomy_cap:u1",
      ]),
    );
  });

  it("resolves to the interactive default when nothing is stored", async () => {
    await expect(
      resolveAutonomyCap({ userId: "u1", teamId: "t1" }),
    ).resolves.toBe("interactive");
  });

  it("skips the team layer when the user has no team", async () => {
    state.rowsByKey = {
      [userAutonomyCapKey("u1")]: [{ value: { cap: "plan" } }],
    };
    await expect(
      resolveAutonomyCap({ userId: "u1", teamId: null }),
    ).resolves.toBe("plan");
    const queriedKeys = h.eqMock.mock.calls.map((call) => call[1]);
    expect(queriedKeys).not.toEqual(
      expect.arrayContaining([expect.stringContaining("team_autonomy_cap")]),
    );
  });

  it("ignores malformed stored values", async () => {
    state.rowsByKey = {
      [ORG_AUTONOMY_CAP_KEY]: [{ value: { cap: "warp-speed" } }],
      [userAutonomyCapKey("u1")]: [{ value: "plan" }],
    };
    await expect(resolveAutonomyCap({ userId: "u1" })).resolves.toBe(
      "interactive",
    );
  });

  it("fails closed to the default when the settings table is unreachable", async () => {
    state.selectThrows = true;
    await expect(
      resolveAutonomyCap({ userId: "u1", teamId: "t1" }),
    ).resolves.toBe("interactive");
  });
});

// ── getters / setters ────────────────────────────────────────────────────────

describe("getOrgAutonomyCap", () => {
  it("returns the stored org cap", async () => {
    state.rowsByKey = {
      [ORG_AUTONOMY_CAP_KEY]: [{ value: { cap: "plan" } }],
    };
    await expect(getOrgAutonomyCap()).resolves.toBe("plan");
  });

  it("returns the interactive default when unset", async () => {
    await expect(getOrgAutonomyCap()).resolves.toBe("interactive");
  });
});

describe("setters", () => {
  it("setOrgAutonomyCap upserts { cap } under the org key", async () => {
    await setOrgAutonomyCap("plan");
    expect(insertValuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        key: ORG_AUTONOMY_CAP_KEY,
        value: { cap: "plan" },
      }),
    );
    expect(onConflictMock).toHaveBeenCalledWith(
      expect.objectContaining({
        set: expect.objectContaining({ value: { cap: "plan" } }),
      }),
    );
  });

  it("setTeamAutonomyCap upserts under team_autonomy_cap:<teamId>", async () => {
    await setTeamAutonomyCap("t1", "autopilot");
    expect(insertValuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        key: "team_autonomy_cap:t1",
        value: { cap: "autopilot" },
      }),
    );
  });

  it("setUserAutonomyCap clears a grant with null", async () => {
    await setUserAutonomyCap("u1", null);
    expect(insertValuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        key: "user_autonomy_cap:u1",
        value: null,
      }),
    );
  });
});
