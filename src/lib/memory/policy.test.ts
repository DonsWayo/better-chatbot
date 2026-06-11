import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Drizzle mock chain (local-policy.test.ts pattern) ────────────────────────
// select({...}).from(T).where(cond) resolves rows keyed by the eq()/like()
// condition captured through the operator mocks, so point reads (readBool,
// .limit(1)) and the team-override LIKE scans can be fed independently.

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
vi.mock("server-only", () => ({}));

import {
  DEFAULT_MEMORY_POLICY,
  ORG_MEMORY_ENABLED_KEY,
  ORG_MEMORY_IMPLICIT_EXTRACTION_KEY,
  isMemoryMode,
  listTeamMemoryOverrides,
  resolveMemoryLayers,
  resolveMemoryPolicy,
  setOrgMemoryEnabled,
  setTeamMemoryEnabled,
  setTeamMemoryImplicitExtraction,
  teamMemoryEnabledKey,
  teamMemoryImplicitExtractionKey,
} from "./policy";

beforeEach(() => {
  h.state.rowsByKey = {};
  h.state.likeRows = [];
  h.state.selectThrows = false;
  vi.clearAllMocks();
});

describe("defaults", () => {
  it("memory is ON and implicit extraction is OFF by default", () => {
    expect(DEFAULT_MEMORY_POLICY).toEqual({
      enabled: true,
      implicitExtraction: false,
    });
  });

  it("resolveMemoryPolicy with nothing configured returns the defaults", async () => {
    const policy = await resolveMemoryPolicy("team-1");
    expect(policy).toEqual({ enabled: true, implicitExtraction: false });
  });

  it("falls back to defaults when the settings store is unreadable", async () => {
    h.state.selectThrows = true;
    const policy = await resolveMemoryPolicy("team-1");
    expect(policy).toEqual(DEFAULT_MEMORY_POLICY);
  });
});

describe("resolveMemoryLayers (pure)", () => {
  it("org layer overrides the default", () => {
    expect(
      resolveMemoryLayers(DEFAULT_MEMORY_POLICY, {
        enabled: false,
        implicitExtraction: true,
      }),
    ).toEqual({ enabled: false, implicitExtraction: true });
  });

  it("team layer wins over org when set", () => {
    expect(
      resolveMemoryLayers(
        DEFAULT_MEMORY_POLICY,
        { enabled: false, implicitExtraction: null },
        { enabled: true, implicitExtraction: true },
      ),
    ).toEqual({ enabled: true, implicitExtraction: true });
  });

  it("null layers do not participate", () => {
    expect(
      resolveMemoryLayers(
        DEFAULT_MEMORY_POLICY,
        { enabled: null, implicitExtraction: null },
        { enabled: null, implicitExtraction: null },
      ),
    ).toEqual(DEFAULT_MEMORY_POLICY);
  });
});

describe("resolveMemoryPolicy (db-backed)", () => {
  it("reads the org layer", async () => {
    h.state.rowsByKey[ORG_MEMORY_ENABLED_KEY] = [{ value: false }];
    const policy = await resolveMemoryPolicy(null);
    expect(policy.enabled).toBe(false);
    expect(policy.implicitExtraction).toBe(false);
  });

  it("team override wins over the org layer", async () => {
    h.state.rowsByKey[ORG_MEMORY_IMPLICIT_EXTRACTION_KEY] = [{ value: false }];
    h.state.rowsByKey[teamMemoryImplicitExtractionKey("t1")] = [
      { value: true },
    ];
    const policy = await resolveMemoryPolicy("t1");
    expect(policy.implicitExtraction).toBe(true);
  });

  it("ignores malformed values (falls through to default)", async () => {
    h.state.rowsByKey[ORG_MEMORY_ENABLED_KEY] = [{ value: "yes" }];
    const policy = await resolveMemoryPolicy(null);
    expect(policy.enabled).toBe(true);
  });

  it("does not read team keys without a teamId", async () => {
    h.state.rowsByKey[teamMemoryEnabledKey("t1")] = [{ value: false }];
    const policy = await resolveMemoryPolicy(undefined);
    expect(policy.enabled).toBe(true);
  });
});

describe("setters", () => {
  it("setOrgMemoryEnabled upserts the org key", async () => {
    await setOrgMemoryEnabled(false);
    expect(h.insertMock).toHaveBeenCalled();
    expect(h.insertValuesMock).toHaveBeenCalledWith(
      expect.objectContaining({ key: ORG_MEMORY_ENABLED_KEY, value: false }),
    );
  });

  it("clears with null", async () => {
    await setOrgMemoryEnabled(null);
    expect(h.insertValuesMock).toHaveBeenCalledWith(
      expect.objectContaining({ key: ORG_MEMORY_ENABLED_KEY, value: null }),
    );
  });
});

describe("team setters", () => {
  it("setTeamMemoryEnabled writes the team-scoped key", async () => {
    await setTeamMemoryEnabled("t1", false);
    expect(h.insertValuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        key: teamMemoryEnabledKey("t1"),
        value: false,
      }),
    );
  });

  it("setTeamMemoryImplicitExtraction clears with null", async () => {
    await setTeamMemoryImplicitExtraction("t1", null);
    expect(h.insertValuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        key: teamMemoryImplicitExtractionKey("t1"),
        value: null,
      }),
    );
  });
});

describe("listTeamMemoryOverrides", () => {
  it("returns [] when no overrides are stored", async () => {
    await expect(listTeamMemoryOverrides()).resolves.toEqual([]);
  });

  it("merges the two key families per team, sorted by teamId", async () => {
    h.state.likeRows = [
      { key: teamMemoryEnabledKey("t2"), value: false },
      { key: teamMemoryEnabledKey("t1"), value: true },
      { key: teamMemoryImplicitExtractionKey("t1"), value: true },
    ];
    await expect(listTeamMemoryOverrides()).resolves.toEqual([
      { teamId: "t1", enabled: true, implicitExtraction: true },
      { teamId: "t2", enabled: false, implicitExtraction: null },
    ]);
  });

  it("treats non-boolean values (cleared overrides) as inherit", async () => {
    h.state.likeRows = [
      { key: teamMemoryEnabledKey("t1"), value: null },
      { key: teamMemoryImplicitExtractionKey("t1"), value: "yes" },
      { key: teamMemoryImplicitExtractionKey("t2"), value: false },
    ];
    await expect(listTeamMemoryOverrides()).resolves.toEqual([
      { teamId: "t2", enabled: null, implicitExtraction: false },
    ]);
  });

  it("fails soft to [] when the store is unreadable", async () => {
    h.state.selectThrows = true;
    await expect(listTeamMemoryOverrides()).resolves.toEqual([]);
  });
});

describe("isMemoryMode", () => {
  it("accepts the tri-state and rejects everything else", () => {
    expect(isMemoryMode("on")).toBe(true);
    expect(isMemoryMode("paused")).toBe(true);
    expect(isMemoryMode("off")).toBe(true);
    expect(isMemoryMode("ON")).toBe(false);
    expect(isMemoryMode(null)).toBe(false);
    expect(isMemoryMode(undefined)).toBe(false);
  });
});
