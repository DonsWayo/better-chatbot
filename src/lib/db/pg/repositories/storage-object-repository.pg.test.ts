import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the drizzle db so the repository can be unit-tested without a live
// Postgres connection. We only drive the read path used by
// canAccessStorageKey -> getStorageObjectByKey.
const { selectRowsMock } = vi.hoisted(() => ({
  selectRowsMock: vi.fn<() => unknown[]>(),
}));

vi.mock("../db.pg", () => {
  const limit = () => Promise.resolve(selectRowsMock());
  const where = () => ({ limit });
  const from = () => ({ where });
  const select = () => ({ from });
  return { pgDb: { select } };
});

import { pgStorageObjectRepository } from "./storage-object-repository.pg";

describe("pgStorageObjectRepository.canAccessStorageKey", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns true when the user owns the key", async () => {
    selectRowsMock.mockReturnValueOnce([
      { storageKey: "uploads/k.csv", uploaderUserId: "u1" },
    ]);
    await expect(
      pgStorageObjectRepository.canAccessStorageKey("uploads/k.csv", "u1"),
    ).resolves.toBe(true);
  });

  it("returns false when a different user owns the key", async () => {
    selectRowsMock.mockReturnValueOnce([
      { storageKey: "uploads/k.csv", uploaderUserId: "u2" },
    ]);
    await expect(
      pgStorageObjectRepository.canAccessStorageKey("uploads/k.csv", "u1"),
    ).resolves.toBe(false);
  });

  it("returns false when no owner record exists (fail-closed)", async () => {
    selectRowsMock.mockReturnValueOnce([]);
    await expect(
      pgStorageObjectRepository.canAccessStorageKey("uploads/missing.csv", "u1"),
    ).resolves.toBe(false);
  });
});
