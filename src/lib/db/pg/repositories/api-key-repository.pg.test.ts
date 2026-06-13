import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the drizzle db so the repository can be unit-tested without a live
// Postgres connection. We capture inserted/updated values and drive the read
// path through queued select results.
const {
  insertValuesReturningMock,
  insertValuesMock,
  updateSetMock,
  updateWhereReturningMock,
  selectQueue,
} = vi.hoisted(() => {
  const insertValuesReturningMock = vi.fn();
  const insertValuesMock = vi.fn();
  const updateSetMock = vi.fn();
  const updateWhereReturningMock = vi.fn();
  const selectQueue: unknown[][] = [];
  return {
    insertValuesReturningMock,
    insertValuesMock,
    updateSetMock,
    updateWhereReturningMock,
    selectQueue,
  };
});

vi.mock("../db.pg", () => {
  // select().from().where().orderBy()  -> Promise<rows>
  // select().from().where().limit()    -> Promise<rows>
  // select().from().orderBy()          -> Promise<rows>
  const nextSelect = () => Promise.resolve(selectQueue.shift() ?? []);
  const selectChain = () => {
    const terminal = {
      orderBy: () => nextSelect(),
      limit: () => nextSelect(),
      then: (r: (v: unknown) => unknown) => nextSelect().then(r),
    };
    return {
      from: () => ({
        where: () => terminal,
        orderBy: () => nextSelect(),
      }),
    };
  };

  // insert().values(v).returning()
  const insert = () => ({
    values: (v: unknown) => {
      insertValuesMock(v);
      return { returning: () => insertValuesReturningMock() };
    },
  });

  // update().set(v).where(cond)  (awaitable) + .returning()
  const update = () => ({
    set: (v: unknown) => {
      updateSetMock(v);
      return {
        where: () => ({
          returning: () => updateWhereReturningMock(),
          then: (r: (v: unknown) => unknown) => Promise.resolve().then(r),
        }),
      };
    },
  });

  return { pgDb: { select: selectChain, insert, update } };
});

import {
  createApiKey,
  findByPlaintext,
  hashApiKey,
  revokeApiKey,
} from "./api-key-repository.pg";

beforeEach(() => {
  vi.clearAllMocks();
  selectQueue.length = 0;
});

describe("createApiKey", () => {
  it("returns a one-time plaintext and stores only its sha256 hash", async () => {
    insertValuesReturningMock.mockReturnValueOnce([
      { id: "k1", keyPrefix: "ck_live_Ab", name: "ci" },
    ]);

    const { plaintext, record } = await createApiKey({
      name: "ci",
      createdBy: "u1",
    });

    expect(plaintext.startsWith("ck_live_")).toBe(true);
    expect(record.id).toBe("k1");

    // The persisted row carries the hash, never the plaintext.
    const persisted = insertValuesMock.mock.calls[0][0] as {
      keyHash: string;
      keyPrefix: string;
      scopes: string[];
    };
    expect(persisted.keyHash).toBe(hashApiKey(plaintext));
    expect(persisted.keyHash).not.toContain(plaintext);
    expect(persisted.keyPrefix).toBe(plaintext.slice(0, 11));
    expect(persisted.scopes).toEqual(["*"]);
  });

  it("hash round-trips: the same plaintext always hashes the same", () => {
    const p = "ck_live_deadbeef";
    expect(hashApiKey(p)).toBe(hashApiKey(p));
    expect(hashApiKey(p)).not.toBe(hashApiKey("ck_live_other"));
  });
});

describe("findByPlaintext", () => {
  it("rejects a token without the ck_live_ prefix without querying", async () => {
    await expect(findByPlaintext("nope")).resolves.toBeNull();
  });

  it("returns the row and stamps last_used_at on a valid key", async () => {
    selectQueue.push([
      { id: "k1", keyHash: "h", revokedAt: null, expiresAt: null },
    ]);
    const row = await findByPlaintext("ck_live_valid");
    expect(row?.id).toBe("k1");
    // last_used_at stamp issued via update().set()
    expect(updateSetMock).toHaveBeenCalledWith(
      expect.objectContaining({ lastUsedAt: expect.any(Date) }),
    );
  });

  it("returns null for an unknown key", async () => {
    selectQueue.push([]);
    await expect(findByPlaintext("ck_live_unknown")).resolves.toBeNull();
  });

  it("rejects a revoked key", async () => {
    selectQueue.push([
      { id: "k1", keyHash: "h", revokedAt: new Date(), expiresAt: null },
    ]);
    await expect(findByPlaintext("ck_live_revoked")).resolves.toBeNull();
    expect(updateSetMock).not.toHaveBeenCalled();
  });

  it("rejects an expired key", async () => {
    selectQueue.push([
      {
        id: "k1",
        keyHash: "h",
        revokedAt: null,
        expiresAt: new Date(Date.now() - 1000),
      },
    ]);
    await expect(findByPlaintext("ck_live_expired")).resolves.toBeNull();
    expect(updateSetMock).not.toHaveBeenCalled();
  });
});

describe("revokeApiKey", () => {
  it("stamps revoked_at and returns the updated row", async () => {
    updateWhereReturningMock.mockReturnValueOnce([
      { id: "k1", revokedAt: new Date() },
    ]);
    const row = await revokeApiKey("k1");
    expect(row?.id).toBe("k1");
    expect(updateSetMock).toHaveBeenCalledWith(
      expect.objectContaining({ revokedAt: expect.any(Date) }),
    );
  });
});
