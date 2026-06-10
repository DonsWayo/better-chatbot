import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Drizzle mock chain ────────────────────────────────────────────────────────
// Captures the condition objects produced by the (mocked) drizzle operators so
// the tests can assert WHICH filters each store function applies — in
// particular that "active" always means supersededBy IS NULL.

const h = vi.hoisted(() => {
  const state = { rows: [] as unknown[] };

  const whereMock = vi.fn((_cond?: unknown) => ({
    orderBy: vi.fn().mockImplementation(() => Promise.resolve(state.rows)),
  }));
  const selectMock = vi.fn(() => ({
    from: vi.fn(() => ({ where: whereMock })),
  }));

  const insertReturningMock = vi
    .fn()
    .mockImplementation(() => Promise.resolve(state.rows));
  const insertValuesMock = vi.fn(() => ({ returning: insertReturningMock }));
  const insertMock = vi.fn(() => ({ values: insertValuesMock }));

  const updateWhereMock = vi.fn().mockResolvedValue([]);
  const updateSetMock = vi.fn(() => ({ where: updateWhereMock }));
  const updateMock = vi.fn(() => ({ set: updateSetMock }));

  const deleteWhereMock = vi.fn().mockResolvedValue([]);
  const deleteMock = vi.fn(() => ({ where: deleteWhereMock }));

  return {
    state,
    whereMock,
    selectMock,
    insertMock,
    insertValuesMock,
    updateMock,
    updateSetMock,
    updateWhereMock,
    deleteMock,
    deleteWhereMock,
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
  UserMemoryTable: {
    id: "id",
    userId: "userId",
    scopeId: "scopeId",
    supersededBy: "supersededBy",
    createdAt: "createdAt",
    lastUsedAt: "lastUsedAt",
  },
}));
vi.mock("drizzle-orm", () => ({
  and: vi.fn((...conds: unknown[]) => ({ op: "and", conds })),
  eq: vi.fn((col: unknown, val: unknown) => ({ op: "eq", col, val })),
  isNull: vi.fn((col: unknown) => ({ op: "isNull", col })),
  inArray: vi.fn((col: unknown, vals: unknown[]) => ({
    op: "inArray",
    col,
    vals,
  })),
  desc: vi.fn((col: unknown) => ({ op: "desc", col })),
}));
vi.mock("server-only", () => ({}));

import {
  bumpLastUsed,
  deleteAllMemories,
  deleteMemory,
  insertMemory,
  listActiveMemories,
  supersedeMemory,
} from "./store";

interface CondNode {
  op: string;
  col?: unknown;
  val?: unknown;
  conds?: CondNode[];
}

beforeEach(() => {
  h.state.rows = [];
  vi.clearAllMocks();
});

describe("listActiveMemories", () => {
  it("filters by user AND superseded IS NULL (supersede filter)", async () => {
    await listActiveMemories("u1");
    const cond = h.whereMock.mock.calls[0][0] as unknown as CondNode;
    expect(cond.op).toBe("and");
    expect(cond.conds).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ op: "eq", col: "userId", val: "u1" }),
        expect.objectContaining({ op: "isNull", col: "supersededBy" }),
      ]),
    );
    expect(cond.conds).toHaveLength(2); // no scope filter when omitted
  });

  it("adds a scope filter when scopeId is provided", async () => {
    await listActiveMemories("u1", "agent:a1");
    const cond = h.whereMock.mock.calls[0][0] as unknown as CondNode;
    expect(cond.conds).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ op: "eq", col: "scopeId", val: "agent:a1" }),
      ]),
    );
  });

  it("scopeId null filters to global-scope rows", async () => {
    await listActiveMemories("u1", null);
    const cond = h.whereMock.mock.calls[0][0] as unknown as CondNode;
    expect(cond.conds).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ op: "isNull", col: "scopeId" }),
      ]),
    );
  });
});

describe("insertMemory", () => {
  it("inserts with defaults and returns the row", async () => {
    h.state.rows = [{ id: "m1" }];
    const row = await insertMemory({
      userId: "u1",
      kind: "preference",
      content: "Prefers Spanish replies",
    });
    expect(row).toEqual({ id: "m1" });
    expect(h.insertValuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "u1",
        kind: "preference",
        content: "Prefers Spanish replies",
        scopeId: null,
        embedding: null,
        sourceThreadId: null,
        confidence: 0.5,
      }),
    );
  });
});

describe("supersedeMemory", () => {
  it("sets supersededBy scoped to owner and not-already-superseded", async () => {
    await supersedeMemory("old1", "new1", "u1");
    expect(h.updateSetMock).toHaveBeenCalledWith({ supersededBy: "new1" });
    const cond = h.updateWhereMock.mock.calls[0][0] as unknown as CondNode;
    expect(cond.conds).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ op: "eq", col: "id", val: "old1" }),
        expect.objectContaining({ op: "eq", col: "userId", val: "u1" }),
        expect.objectContaining({ op: "isNull", col: "supersededBy" }),
      ]),
    );
  });
});

describe("delete paths", () => {
  it("deleteMemory is owner-scoped", async () => {
    await deleteMemory("m1", "u1");
    const cond = h.deleteWhereMock.mock.calls[0][0] as unknown as CondNode;
    expect(cond.conds).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ op: "eq", col: "id", val: "m1" }),
        expect.objectContaining({ op: "eq", col: "userId", val: "u1" }),
      ]),
    );
  });

  it("deleteAllMemories deletes every row for the user", async () => {
    await deleteAllMemories("u1");
    const cond = h.deleteWhereMock.mock.calls[0][0] as unknown as CondNode;
    expect(cond).toEqual(
      expect.objectContaining({ op: "eq", col: "userId", val: "u1" }),
    );
  });
});

describe("bumpLastUsed", () => {
  it("no-ops on an empty list", async () => {
    await bumpLastUsed([]);
    expect(h.updateMock).not.toHaveBeenCalled();
  });

  it("updates lastUsedAt for the given ids", async () => {
    await bumpLastUsed(["a", "b"]);
    expect(h.updateSetMock).toHaveBeenCalledWith(
      expect.objectContaining({ lastUsedAt: expect.any(Date) }),
    );
    const cond = h.updateWhereMock.mock.calls[0][0] as unknown as CondNode;
    expect(cond).toEqual(
      expect.objectContaining({ op: "inArray", col: "id", vals: ["a", "b"] }),
    );
  });
});
