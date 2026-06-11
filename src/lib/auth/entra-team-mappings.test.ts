import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Drizzle mock chain ────────────────────────────────────────────────────────
// select({...}).from(T).where(...).limit(1) → state.selectRows
// insert(T).values(v).onConflictDoUpdate/DoNothing(...) → recorded

const h = vi.hoisted(() => {
  const state = {
    selectRows: [] as unknown[],
    selectThrows: false,
    insertThrows: false,
  };

  const limitMock = vi.fn(() =>
    state.selectThrows
      ? Promise.reject(new Error("db down"))
      : Promise.resolve(state.selectRows),
  );
  const whereMock = vi.fn(() => ({ limit: limitMock }));
  const fromMock = vi.fn(() => ({ where: whereMock }));
  const selectMock = vi.fn(() => ({ from: fromMock }));

  const onConflictDoUpdateMock = vi.fn(() => Promise.resolve([]));
  const onConflictDoNothingMock = vi.fn(() =>
    state.insertThrows
      ? Promise.reject(new Error("fk violation"))
      : Promise.resolve([]),
  );
  const insertValuesMock = vi.fn(() => ({
    onConflictDoUpdate: onConflictDoUpdateMock,
    onConflictDoNothing: onConflictDoNothingMock,
  }));
  const insertMock = vi.fn(() => ({ values: insertValuesMock }));

  const updateMock = vi.fn();
  const deleteMock = vi.fn();

  return {
    state,
    selectMock,
    insertMock,
    insertValuesMock,
    onConflictDoUpdateMock,
    onConflictDoNothingMock,
    updateMock,
    deleteMock,
  };
});

vi.mock("lib/db/pg/db.pg", () => ({
  pgDb: {
    select: h.selectMock,
    insert: h.insertMock,
    update: h.updateMock,
    delete: h.deleteMock,
  },
}));

vi.mock("lib/db/pg/schema.pg", () => ({
  AsafeOrgSettingsTable: { key: "key", value: "value" },
  AsafeTeamMemberTable: { teamId: "teamId", userId: "userId", role: "role" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((_a: unknown, b: unknown) => ({ key: b })),
}));

vi.mock("logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  ENTRA_TEAM_MAPPINGS_KEY,
  getEntraTeamMappings,
  parseEntraTeamMappings,
  setEntraTeamMappings,
  syncEntraTeamMemberships,
  teamIdsForGroups,
} from "./entra-team-mappings";

beforeEach(() => {
  vi.clearAllMocks();
  h.state.selectRows = [];
  h.state.selectThrows = false;
  h.state.insertThrows = false;
});

describe("parseEntraTeamMappings", () => {
  it("accepts a clean array of pairs", () => {
    expect(
      parseEntraTeamMappings([
        { groupId: "g1", teamId: "t1" },
        { groupId: "g2", teamId: "t2" },
      ]),
    ).toEqual([
      { groupId: "g1", teamId: "t1" },
      { groupId: "g2", teamId: "t2" },
    ]);
  });

  it("returns [] for non-array values (malformed JSON fail-soft)", () => {
    expect(parseEntraTeamMappings(null)).toEqual([]);
    expect(parseEntraTeamMappings(undefined)).toEqual([]);
    expect(parseEntraTeamMappings("oops")).toEqual([]);
    expect(parseEntraTeamMappings({ groupId: "g", teamId: "t" })).toEqual([]);
    expect(parseEntraTeamMappings(42)).toEqual([]);
  });

  it("drops entries that are not {groupId: string, teamId: string}", () => {
    expect(
      parseEntraTeamMappings([
        null,
        "string",
        { groupId: "g1" },
        { teamId: "t1" },
        { groupId: 1, teamId: "t1" },
        { groupId: "g1", teamId: { nested: true } },
        { groupId: "g-ok", teamId: "t-ok" },
      ]),
    ).toEqual([{ groupId: "g-ok", teamId: "t-ok" }]);
  });

  it("trims fields and drops empty/whitespace-only values", () => {
    expect(
      parseEntraTeamMappings([
        { groupId: "  g1  ", teamId: " t1 " },
        { groupId: "   ", teamId: "t2" },
        { groupId: "g3", teamId: "" },
      ]),
    ).toEqual([{ groupId: "g1", teamId: "t1" }]);
  });

  it("dedupes exact (groupId, teamId) pairs but keeps fan-out", () => {
    expect(
      parseEntraTeamMappings([
        { groupId: "g1", teamId: "t1" },
        { groupId: "g1", teamId: "t1" },
        { groupId: "g1", teamId: "t2" }, // same group, second team — kept
        { groupId: "g2", teamId: "t1" }, // second group, same team — kept
      ]),
    ).toEqual([
      { groupId: "g1", teamId: "t1" },
      { groupId: "g1", teamId: "t2" },
      { groupId: "g2", teamId: "t1" },
    ]);
  });
});

describe("getEntraTeamMappings", () => {
  it("returns the parsed stored value", async () => {
    h.state.selectRows = [{ value: [{ groupId: "g1", teamId: "t1" }] }];
    await expect(getEntraTeamMappings()).resolves.toEqual([
      { groupId: "g1", teamId: "t1" },
    ]);
  });

  it("returns [] when the key is absent", async () => {
    h.state.selectRows = [];
    await expect(getEntraTeamMappings()).resolves.toEqual([]);
  });

  it("returns [] for a malformed stored value", async () => {
    h.state.selectRows = [{ value: { not: "an array" } }];
    await expect(getEntraTeamMappings()).resolves.toEqual([]);
  });

  it("fails soft to [] when the settings store is unreachable", async () => {
    h.state.selectThrows = true;
    await expect(getEntraTeamMappings()).resolves.toEqual([]);
  });
});

describe("setEntraTeamMappings", () => {
  it("upserts the cleaned, deduped list under the settings key", async () => {
    await setEntraTeamMappings([
      { groupId: " g1 ", teamId: "t1" },
      { groupId: "g1", teamId: "t1" },
    ]);
    expect(h.insertMock).toHaveBeenCalledTimes(1);
    const values = (h.insertValuesMock.mock.calls[0] as unknown[])[0] as {
      key: string;
      value: unknown;
    };
    expect(values.key).toBe(ENTRA_TEAM_MAPPINGS_KEY);
    expect(values.value).toEqual([{ groupId: "g1", teamId: "t1" }]);
    expect(h.onConflictDoUpdateMock).toHaveBeenCalledTimes(1);
  });
});

describe("teamIdsForGroups", () => {
  const mappings = [
    { groupId: "g1", teamId: "t1" },
    { groupId: "g1", teamId: "t2" },
    { groupId: "g2", teamId: "t2" },
    { groupId: "g3", teamId: "t3" },
  ];

  it("returns teams for groups present in the claims, deduped", () => {
    expect(teamIdsForGroups(mappings, ["g1", "g2"])).toEqual(["t1", "t2"]);
  });

  it("returns [] when no group matches", () => {
    expect(teamIdsForGroups(mappings, ["g-x"])).toEqual([]);
  });

  it("returns [] for empty claims or empty mappings", () => {
    expect(teamIdsForGroups(mappings, [])).toEqual([]);
    expect(teamIdsForGroups([], ["g1"])).toEqual([]);
  });
});

describe("syncEntraTeamMemberships", () => {
  it("ensures membership (role member, conflict-do-nothing) for each mapped team", async () => {
    h.state.selectRows = [
      {
        value: [
          { groupId: "g1", teamId: "t1" },
          { groupId: "g2", teamId: "t2" },
          { groupId: "g-other", teamId: "t9" },
        ],
      },
    ];
    const assigned = await syncEntraTeamMemberships("user-1", ["g1", "g2"]);
    expect(assigned).toEqual(["t1", "t2"]);
    expect(h.insertValuesMock).toHaveBeenCalledTimes(2);
    expect(h.insertValuesMock).toHaveBeenCalledWith({
      teamId: "t1",
      userId: "user-1",
      role: "member",
    });
    expect(h.insertValuesMock).toHaveBeenCalledWith({
      teamId: "t2",
      userId: "user-1",
      role: "member",
    });
    // Additive only: inserts use onConflictDoNothing — an existing member's
    // team role is never updated, and nothing is ever deleted.
    expect(h.onConflictDoNothingMock).toHaveBeenCalledTimes(2);
    expect(h.onConflictDoUpdateMock).not.toHaveBeenCalled();
    expect(h.updateMock).not.toHaveBeenCalled();
    expect(h.deleteMock).not.toHaveBeenCalled();
  });

  it("does nothing (no db reads/writes) for empty group claims", async () => {
    const assigned = await syncEntraTeamMemberships("user-1", []);
    expect(assigned).toEqual([]);
    expect(h.selectMock).not.toHaveBeenCalled();
    expect(h.insertMock).not.toHaveBeenCalled();
  });

  it("does not insert when no mapping matches the claims", async () => {
    h.state.selectRows = [{ value: [{ groupId: "g9", teamId: "t9" }] }];
    const assigned = await syncEntraTeamMemberships("user-1", ["g1"]);
    expect(assigned).toEqual([]);
    expect(h.insertMock).not.toHaveBeenCalled();
  });

  it("never throws when the settings store is unreachable", async () => {
    h.state.selectThrows = true;
    await expect(syncEntraTeamMemberships("user-1", ["g1"])).resolves.toEqual(
      [],
    );
  });

  it("skips a failing team insert (e.g. deleted team) without throwing", async () => {
    h.state.selectRows = [{ value: [{ groupId: "g1", teamId: "t-deleted" }] }];
    h.state.insertThrows = true;
    await expect(syncEntraTeamMemberships("user-1", ["g1"])).resolves.toEqual([
      "t-deleted",
    ]);
  });
});
