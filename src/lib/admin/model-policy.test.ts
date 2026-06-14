import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Drizzle mock chain ────────────────────────────────────────────────────────
// select({...}).from(T).where(...).limit(1) → Promise<rows>, where the rows
// returned depend on which (mocked) table T was queried so the parallel
// org-settings + team selects inside resolveTeamModelAllowList can be fed
// independently.

const h = vi.hoisted(() => {
  const state = {
    orgRows: [] as unknown[],
    teamRows: [] as unknown[],
    orgSelectThrows: false,
  };

  const fromMock = vi.fn((table: { _tbl?: string } | undefined) => ({
    where: vi.fn().mockReturnValue({
      limit: vi.fn().mockImplementation(() => {
        if (table?._tbl === "org") {
          if (state.orgSelectThrows)
            return Promise.reject(new Error("db down"));
          return Promise.resolve(state.orgRows);
        }
        return Promise.resolve(state.teamRows);
      }),
    }),
  }));
  const selectMock = vi.fn().mockReturnValue({ from: fromMock });

  const onConflictMock = vi.fn().mockResolvedValue([]);
  const insertValuesMock = vi
    .fn()
    .mockReturnValue({ onConflictDoUpdate: onConflictMock });
  const insertMock = vi.fn().mockReturnValue({ values: insertValuesMock });

  const updateWhereMock = vi.fn().mockResolvedValue({ rowCount: 1 });
  const updateSetMock = vi.fn().mockReturnValue({ where: updateWhereMock });
  const updateMock = vi.fn().mockReturnValue({ set: updateSetMock });

  return {
    state,
    fromMock,
    selectMock,
    onConflictMock,
    insertValuesMock,
    insertMock,
    updateWhereMock,
    updateSetMock,
    updateMock,
  };
});

const {
  state,
  fromMock,
  selectMock,
  onConflictMock,
  insertValuesMock,
  insertMock,
  updateWhereMock,
  updateSetMock,
  updateMock,
} = h;

vi.mock("lib/db/pg/db.pg", () => ({
  pgDb: { select: h.selectMock, insert: h.insertMock, update: h.updateMock },
}));

vi.mock("lib/db/pg/schema.pg", () => ({
  AsafeOrgSettingsTable: { _tbl: "org", key: "key", value: "value" },
  AsafeTeamTable: {
    _tbl: "team",
    id: "id",
    modelPolicy: "modelPolicy",
    modelAllowList: "modelAllowList",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((_a: unknown, _b: unknown) => ({})),
}));

vi.mock("server-only", () => ({}));

const loggerErrorMock = vi.hoisted(() => vi.fn());
vi.mock("logger", () => ({
  default: {
    withDefaults: () => ({
      error: loggerErrorMock,
      warn: vi.fn(),
      info: vi.fn(),
      debug: vi.fn(),
    }),
  },
}));

import {
  ORG_BASE_MODEL_ALLOW_LIST_KEY,
  clearOrgBaseModelAllowListCache,
  getOrgBaseModelAllowList,
  resolveModelAllowList,
  resolveTeamModelAllowList,
  setOrgBaseModelAllowList,
  setTeamModelPolicy,
} from "./model-policy";

beforeEach(() => {
  vi.clearAllMocks();
  // getOrgBaseModelAllowList now caches in-process — clear between cases so
  // each test reads its own mocked org rows.
  clearOrgBaseModelAllowListCache();
  state.orgRows = [];
  state.teamRows = [];
  state.orgSelectThrows = false;
  selectMock.mockReturnValue({ from: fromMock });
  insertMock.mockReturnValue({ values: insertValuesMock });
  insertValuesMock.mockReturnValue({ onConflictDoUpdate: onConflictMock });
  updateMock.mockReturnValue({ set: updateSetMock });
  updateSetMock.mockReturnValue({ where: updateWhereMock });
});

// ── resolveModelAllowList (pure composition) ─────────────────────────────────

describe("resolveModelAllowList", () => {
  const BASE = ["gpt-5.5", "claude-opus-4.8", "gemini-3.5-flash"];

  it("inherit mode adds extra models on top of the base", () => {
    expect(
      resolveModelAllowList(BASE, { mode: "inherit", add: ["o4-mini"] }),
    ).toEqual(["gpt-5.5", "claude-opus-4.8", "gemini-3.5-flash", "o4-mini"]);
  });

  it("inherit mode removes specific base models", () => {
    expect(
      resolveModelAllowList(BASE, {
        mode: "inherit",
        remove: ["claude-opus-4.8"],
      }),
    ).toEqual(["gpt-5.5", "gemini-3.5-flash"]);
  });

  it("inherit mode applies add and remove together and dedupes", () => {
    expect(
      resolveModelAllowList(BASE, {
        mode: "inherit",
        add: ["o4-mini", "gpt-5.5"], // gpt-5.5 already in base → deduped
        remove: ["gemini-3.5-flash"],
      }),
    ).toEqual(["gpt-5.5", "claude-opus-4.8", "o4-mini"]);
  });

  it("replace mode ignores the base entirely", () => {
    expect(
      resolveModelAllowList(BASE, {
        mode: "replace",
        models: ["o4-mini"],
        add: ["ignored-add"],
        remove: ["ignored-remove"],
      }),
    ).toEqual(["o4-mini"]);
  });

  it("replace mode with no models yields an empty list", () => {
    expect(resolveModelAllowList(BASE, { mode: "replace" })).toEqual([]);
  });

  it("no override passes the base through unchanged", () => {
    expect(resolveModelAllowList(BASE, null)).toEqual(BASE);
    expect(resolveModelAllowList(BASE, null, [])).toEqual(BASE);
  });

  it("legacy non-empty model_allow_list is treated as a replace override", () => {
    expect(resolveModelAllowList(BASE, null, ["legacy-model"])).toEqual([
      "legacy-model",
    ]);
  });

  it("an explicit model_policy takes precedence over the legacy list", () => {
    expect(
      resolveModelAllowList(BASE, { mode: "inherit", add: ["o4-mini"] }, [
        "legacy-model",
      ]),
    ).toEqual([...BASE, "o4-mini"]);
  });

  it("null base + inherit with adds resolves to just the adds (minus removes)", () => {
    expect(
      resolveModelAllowList(null, {
        mode: "inherit",
        add: ["o4-mini", "gpt-5.5"],
        remove: ["gpt-5.5"],
      }),
    ).toEqual(["o4-mini"]);
  });

  it("null base + inherit without adds stays unrestricted (null)", () => {
    expect(
      resolveModelAllowList(null, { mode: "inherit", remove: ["gpt-5.5"] }),
    ).toBeNull();
  });

  it("resolves to null (unrestricted) when there is no base and no override", () => {
    expect(resolveModelAllowList(null, null)).toBeNull();
    expect(resolveModelAllowList(null, null, [])).toBeNull();
  });
});

// ── getOrgBaseModelAllowList / setOrgBaseModelAllowList ─────────────────────

describe("getOrgBaseModelAllowList", () => {
  it("returns the stored array, deduped and string-filtered", async () => {
    state.orgRows = [{ value: ["gpt-5.5", "gpt-5.5", 42, "o4-mini"] }];
    await expect(getOrgBaseModelAllowList()).resolves.toEqual([
      "gpt-5.5",
      "o4-mini",
    ]);
  });

  it("returns null when no setting row exists", async () => {
    state.orgRows = [];
    await expect(getOrgBaseModelAllowList()).resolves.toBeNull();
  });

  it("returns null when the stored value is not an array", async () => {
    state.orgRows = [{ value: { not: "a list" } }];
    await expect(getOrgBaseModelAllowList()).resolves.toBeNull();
  });

  it("fails open (null) when the settings table is unreachable", async () => {
    state.orgSelectThrows = true;
    await expect(getOrgBaseModelAllowList()).resolves.toBeNull();
  });

  it("logs an error when the settings store is unreachable (observable fail-open)", async () => {
    loggerErrorMock.mockClear();
    state.orgSelectThrows = true;
    await getOrgBaseModelAllowList();
    expect(loggerErrorMock).toHaveBeenCalled();
  });
});

describe("setOrgBaseModelAllowList", () => {
  it("upserts the deduped list under the org settings key", async () => {
    await setOrgBaseModelAllowList(["gpt-5.5", "gpt-5.5", "o4-mini"]);
    expect(insertValuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        key: ORG_BASE_MODEL_ALLOW_LIST_KEY,
        value: ["gpt-5.5", "o4-mini"],
      }),
    );
    expect(onConflictMock).toHaveBeenCalledWith(
      expect.objectContaining({
        set: expect.objectContaining({ value: ["gpt-5.5", "o4-mini"] }),
      }),
    );
  });

  it("clears the base list by upserting a null value", async () => {
    await setOrgBaseModelAllowList(null);
    expect(insertValuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        key: ORG_BASE_MODEL_ALLOW_LIST_KEY,
        value: null,
      }),
    );
  });
});

// ── setTeamModelPolicy ───────────────────────────────────────────────────────

describe("setTeamModelPolicy", () => {
  it("writes the policy to the team row", async () => {
    await setTeamModelPolicy("team-1", { mode: "inherit", add: ["o4-mini"] });
    expect(updateSetMock).toHaveBeenCalledWith(
      expect.objectContaining({
        modelPolicy: { mode: "inherit", add: ["o4-mini"] },
      }),
    );
  });

  it("clears the policy with null", async () => {
    await setTeamModelPolicy("team-1", null);
    expect(updateSetMock).toHaveBeenCalledWith(
      expect.objectContaining({ modelPolicy: null }),
    );
  });
});

// ── resolveTeamModelAllowList (db composition) ───────────────────────────────

describe("resolveTeamModelAllowList", () => {
  it("layers the team inherit override on the stored org base", async () => {
    state.orgRows = [{ value: ["gpt-5.5", "claude-opus-4.8"] }];
    state.teamRows = [
      {
        modelPolicy: {
          mode: "inherit",
          add: ["o4-mini"],
          remove: ["claude-opus-4.8"],
        },
        modelAllowList: [],
      },
    ];
    await expect(resolveTeamModelAllowList("team-1")).resolves.toEqual([
      "gpt-5.5",
      "o4-mini",
    ]);
  });

  it("replace override wins over the org base", async () => {
    state.orgRows = [{ value: ["gpt-5.5", "claude-opus-4.8"] }];
    state.teamRows = [
      {
        modelPolicy: { mode: "replace", models: ["o4-mini"] },
        modelAllowList: ["legacy-ignored"],
      },
    ];
    await expect(resolveTeamModelAllowList("team-1")).resolves.toEqual([
      "o4-mini",
    ]);
  });

  it("falls back to legacy model_allow_list as replace when no model_policy", async () => {
    state.orgRows = [{ value: ["gpt-5.5"] }];
    state.teamRows = [{ modelPolicy: null, modelAllowList: ["legacy-model"] }];
    await expect(resolveTeamModelAllowList("team-1")).resolves.toEqual([
      "legacy-model",
    ]);
  });

  it("passes the org base through for a team without any override", async () => {
    state.orgRows = [{ value: ["gpt-5.5"] }];
    state.teamRows = [{ modelPolicy: null, modelAllowList: [] }];
    await expect(resolveTeamModelAllowList("team-1")).resolves.toEqual([
      "gpt-5.5",
    ]);
  });

  it("resolves to null (unrestricted) when no base and no override exist", async () => {
    state.orgRows = [];
    state.teamRows = [{ modelPolicy: null, modelAllowList: [] }];
    await expect(resolveTeamModelAllowList("team-1")).resolves.toBeNull();
  });

  it("unknown team falls back to the org base", async () => {
    state.orgRows = [{ value: ["gpt-5.5"] }];
    state.teamRows = [];
    await expect(resolveTeamModelAllowList("ghost-team")).resolves.toEqual([
      "gpt-5.5",
    ]);
  });
});
