import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Drizzle mock chain (model-policy.test.ts pattern) ────────────────────────
// select({...}).from(T).where(eq(key)).limit(1) → rows keyed by the settings
// key captured via the eq() mock, so the four parallel reads inside
// resolveMemoryPolicy can be fed independently.

const h = vi.hoisted(() => {
  const state = {
    rowsByKey: {} as Record<string, unknown[]>,
    selectThrows: false,
    lastEqKey: [] as string[],
  };

  const eqMock = vi.fn((_col: unknown, key: unknown) => ({ key }));

  const fromMock = vi.fn(() => ({
    where: vi.fn((cond: { key?: string }) => ({
      limit: vi.fn().mockImplementation(() => {
        if (state.selectThrows) return Promise.reject(new Error("db down"));
        return Promise.resolve(state.rowsByKey[cond?.key ?? ""] ?? []);
      }),
    })),
  }));
  const selectMock = vi.fn().mockReturnValue({ from: fromMock });

  const onConflictMock = vi.fn().mockResolvedValue([]);
  const insertValuesMock = vi
    .fn()
    .mockReturnValue({ onConflictDoUpdate: onConflictMock });
  const insertMock = vi.fn().mockReturnValue({ values: insertValuesMock });

  return { state, eqMock, selectMock, insertMock, insertValuesMock };
});

vi.mock("lib/db/pg/db.pg", () => ({
  pgDb: { select: h.selectMock, insert: h.insertMock },
}));
vi.mock("lib/db/pg/schema.pg", () => ({
  AsafeOrgSettingsTable: { key: "key", value: "value" },
}));
vi.mock("drizzle-orm", () => ({ eq: h.eqMock }));
vi.mock("server-only", () => ({}));

import {
  DEFAULT_MEMORY_POLICY,
  ORG_MEMORY_ENABLED_KEY,
  ORG_MEMORY_IMPLICIT_EXTRACTION_KEY,
  isMemoryMode,
  resolveMemoryLayers,
  resolveMemoryPolicy,
  setOrgMemoryEnabled,
  teamMemoryEnabledKey,
  teamMemoryImplicitExtractionKey,
} from "./policy";

beforeEach(() => {
  h.state.rowsByKey = {};
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
