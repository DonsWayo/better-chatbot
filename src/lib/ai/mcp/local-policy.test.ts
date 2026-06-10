import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Drizzle mock chain (lib/memory/policy.test.ts pattern) ───────────────────
// select({...}).from(T).where(cond) resolves rows keyed by the eq()/like()
// condition captured through the operator mocks, so point reads (readBool,
// .limit(1)) and the team-override LIKE scan can be fed independently.

const h = vi.hoisted(() => {
  const state = {
    rowsByKey: {} as Record<string, unknown[]>,
    likeRows: [] as Array<{ key: string; value: unknown }>,
    selectThrows: false,
  };

  const eqMock = vi.fn((_col: unknown, key: unknown) => ({ key }));
  const likeMock = vi.fn((_col: unknown, pattern: unknown) => ({
    like: pattern,
  }));

  const resolveRows = (cond: { key?: string; like?: string }) => {
    if (state.selectThrows) return Promise.reject(new Error("db down"));
    if (cond?.like !== undefined) {
      const prefix = String(cond.like).replace(/%$/, "");
      return Promise.resolve(
        state.likeRows.filter((row) => row.key.startsWith(prefix)),
      );
    }
    return Promise.resolve(state.rowsByKey[cond?.key ?? ""] ?? []);
  };

  const fromMock = vi.fn(() => ({
    where: vi.fn((cond: { key?: string; like?: string }) => {
      const rowsPromise = resolveRows(cond);
      return {
        limit: vi.fn().mockImplementation(() => rowsPromise),
        then: rowsPromise.then.bind(rowsPromise),
        catch: rowsPromise.catch.bind(rowsPromise),
      };
    }),
  }));
  const selectMock = vi.fn().mockReturnValue({ from: fromMock });

  const onConflictMock = vi.fn().mockResolvedValue([]);
  const insertValuesMock = vi
    .fn()
    .mockReturnValue({ onConflictDoUpdate: onConflictMock });
  const insertMock = vi.fn().mockReturnValue({ values: insertValuesMock });

  return { state, eqMock, likeMock, selectMock, insertMock, insertValuesMock };
});

vi.mock("lib/db/pg/db.pg", () => ({
  pgDb: { select: h.selectMock, insert: h.insertMock },
}));
vi.mock("lib/db/pg/schema.pg", () => ({
  AsafeOrgSettingsTable: { key: "key", value: "value" },
}));
vi.mock("drizzle-orm", () => ({ eq: h.eqMock, like: h.likeMock }));

import {
  DEFAULT_LOCAL_MCP_ENABLED,
  ORG_LOCAL_MCP_ENABLED_KEY,
  TEAM_LOCAL_MCP_ENABLED_KEY_PREFIX,
  isLocalMcpRuntimeEnabled,
  resolveLocalMcpLayers,
  resolveLocalMcpPolicy,
  setOrgLocalMcpEnabled,
  setTeamLocalMcpEnabled,
  teamLocalMcpEnabledKey,
} from "./local-policy";

beforeEach(() => {
  h.state.rowsByKey = {};
  h.state.likeRows = [];
  h.state.selectThrows = false;
  vi.clearAllMocks();
});

describe("defaults (ADR-0009 default-deny)", () => {
  it("local MCP is OFF by default", () => {
    expect(DEFAULT_LOCAL_MCP_ENABLED).toBe(false);
  });

  it("resolveLocalMcpPolicy with nothing configured denies", async () => {
    await expect(resolveLocalMcpPolicy("team-1")).resolves.toBe(false);
  });

  it("fails closed when the settings store is unreadable", async () => {
    h.state.selectThrows = true;
    await expect(resolveLocalMcpPolicy("team-1")).resolves.toBe(false);
    await expect(isLocalMcpRuntimeEnabled()).resolves.toBe(false);
  });
});

describe("resolveLocalMcpLayers (pure)", () => {
  it("org layer overrides the default", () => {
    expect(resolveLocalMcpLayers(true)).toBe(true);
    expect(resolveLocalMcpLayers(false)).toBe(false);
  });

  it("team layer wins over org when set", () => {
    expect(resolveLocalMcpLayers(false, true)).toBe(true);
    expect(resolveLocalMcpLayers(true, false)).toBe(false);
  });

  it("null layers do not participate", () => {
    expect(resolveLocalMcpLayers(null, null)).toBe(false);
    expect(resolveLocalMcpLayers(null, undefined)).toBe(false);
    expect(resolveLocalMcpLayers(true, null)).toBe(true);
  });
});

describe("resolveLocalMcpPolicy (db-backed)", () => {
  it("reads the org layer", async () => {
    h.state.rowsByKey[ORG_LOCAL_MCP_ENABLED_KEY] = [{ value: true }];
    await expect(resolveLocalMcpPolicy(null)).resolves.toBe(true);
  });

  it("team override wins over the org layer", async () => {
    h.state.rowsByKey[ORG_LOCAL_MCP_ENABLED_KEY] = [{ value: false }];
    h.state.rowsByKey[teamLocalMcpEnabledKey("t1")] = [{ value: true }];
    await expect(resolveLocalMcpPolicy("t1")).resolves.toBe(true);
  });

  it("team override can deny an org-enabled base", async () => {
    h.state.rowsByKey[ORG_LOCAL_MCP_ENABLED_KEY] = [{ value: true }];
    h.state.rowsByKey[teamLocalMcpEnabledKey("t1")] = [{ value: false }];
    await expect(resolveLocalMcpPolicy("t1")).resolves.toBe(false);
  });

  it("ignores malformed values (falls through to default-deny)", async () => {
    h.state.rowsByKey[ORG_LOCAL_MCP_ENABLED_KEY] = [{ value: "yes" }];
    await expect(resolveLocalMcpPolicy(null)).resolves.toBe(false);
  });

  it("does not read team keys without a teamId", async () => {
    h.state.rowsByKey[teamLocalMcpEnabledKey("t1")] = [{ value: true }];
    await expect(resolveLocalMcpPolicy(undefined)).resolves.toBe(false);
  });
});

describe("isLocalMcpRuntimeEnabled (process-wide manager gate)", () => {
  it("denies when nothing is configured", async () => {
    await expect(isLocalMcpRuntimeEnabled()).resolves.toBe(false);
  });

  it("enables when the org base is on", async () => {
    h.state.rowsByKey[ORG_LOCAL_MCP_ENABLED_KEY] = [{ value: true }];
    await expect(isLocalMcpRuntimeEnabled()).resolves.toBe(true);
  });

  it("enables when any team override is on even with org base off", async () => {
    h.state.rowsByKey[ORG_LOCAL_MCP_ENABLED_KEY] = [{ value: false }];
    h.state.likeRows = [
      { key: teamLocalMcpEnabledKey("t1"), value: false },
      { key: teamLocalMcpEnabledKey("t2"), value: true },
    ];
    await expect(isLocalMcpRuntimeEnabled()).resolves.toBe(true);
  });

  it("denies when all team overrides are off/cleared", async () => {
    h.state.likeRows = [
      { key: teamLocalMcpEnabledKey("t1"), value: false },
      { key: teamLocalMcpEnabledKey("t2"), value: null },
    ];
    await expect(isLocalMcpRuntimeEnabled()).resolves.toBe(false);
  });
});

describe("setters", () => {
  it("setOrgLocalMcpEnabled upserts the org key", async () => {
    await setOrgLocalMcpEnabled(true);
    expect(h.insertMock).toHaveBeenCalled();
    expect(h.insertValuesMock).toHaveBeenCalledWith(
      expect.objectContaining({ key: ORG_LOCAL_MCP_ENABLED_KEY, value: true }),
    );
  });

  it("setTeamLocalMcpEnabled writes the team-scoped key", async () => {
    await setTeamLocalMcpEnabled("t1", true);
    expect(h.insertValuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        key: `${TEAM_LOCAL_MCP_ENABLED_KEY_PREFIX}t1`,
        value: true,
      }),
    );
  });

  it("clears with null", async () => {
    await setOrgLocalMcpEnabled(null);
    expect(h.insertValuesMock).toHaveBeenCalledWith(
      expect.objectContaining({ key: ORG_LOCAL_MCP_ENABLED_KEY, value: null }),
    );
  });
});
