import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Drizzle mock chains ───────────────────────────────────────────────────────
// insert(...).values({...}).onConflictDoUpdate({...}) → resolves (heartbeat)
// select({...}).from(...).where(...) → resolves to [{ count }] (viewer count)

const h = vi.hoisted(() => {
  const onConflictMock = vi.fn().mockResolvedValue(undefined);
  const valuesMock = vi
    .fn()
    .mockReturnValue({ onConflictDoUpdate: onConflictMock });
  const insertMock = vi.fn().mockReturnValue({ values: valuesMock });

  const whereMock = vi.fn().mockResolvedValue([{ count: 0 }]);
  const fromMock = vi.fn().mockReturnValue({ where: whereMock });
  const selectMock = vi.fn().mockReturnValue({ from: fromMock });

  return {
    onConflictMock,
    valuesMock,
    insertMock,
    whereMock,
    fromMock,
    selectMock,
    getSessionMock: vi.fn(),
  };
});

vi.mock("auth/server", () => ({ getSession: h.getSessionMock }));
vi.mock("lib/db/pg/db.pg", () => ({
  pgDb: { insert: h.insertMock, select: h.selectMock },
}));

import {
  countDocumentViewers,
  heartbeatDocumentPresenceAction,
} from "./document-presence-actions";

const USER_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const EXPORT_ID = "abc123XYZ_-"; // nanoid-style, not a uuid

beforeEach(() => {
  vi.clearAllMocks();
  h.valuesMock.mockReturnValue({ onConflictDoUpdate: h.onConflictMock });
  h.insertMock.mockReturnValue({ values: h.valuesMock });
  h.whereMock.mockResolvedValue([{ count: 0 }]);
  h.fromMock.mockReturnValue({ where: h.whereMock });
  h.selectMock.mockReturnValue({ from: h.fromMock });
  h.getSessionMock.mockResolvedValue({ user: { id: USER_ID } });
});

describe("heartbeatDocumentPresenceAction", () => {
  it("no-ops silently for anonymous viewers (no auth, no error)", async () => {
    h.getSessionMock.mockResolvedValue(null);
    await expect(
      heartbeatDocumentPresenceAction(EXPORT_ID),
    ).resolves.toBeUndefined();
    expect(h.insertMock).not.toHaveBeenCalled();
  });

  it("rejects an invalid document id before touching the db", async () => {
    await expect(
      heartbeatDocumentPresenceAction("bad id with spaces"),
    ).rejects.toThrow("Invalid document id");
    expect(h.insertMock).not.toHaveBeenCalled();
  });

  it("upserts one row scoped to the caller with context_type=document", async () => {
    await heartbeatDocumentPresenceAction(EXPORT_ID);
    expect(h.insertMock).toHaveBeenCalledTimes(1);
    expect(h.valuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: USER_ID,
        contextType: "document",
        contextId: EXPORT_ID,
        lastSeenAt: expect.any(Date),
      }),
    );
    const conflict = h.onConflictMock.mock.calls[0][0] as {
      target: unknown[];
    };
    expect(conflict.target).toHaveLength(3);
  });
});

describe("countDocumentViewers", () => {
  it("returns 0 for an invalid id without querying", async () => {
    const n = await countDocumentViewers("bad id");
    expect(n).toBe(0);
    expect(h.selectMock).not.toHaveBeenCalled();
  });

  it("returns the distinct viewer count from the query", async () => {
    h.whereMock.mockResolvedValue([{ count: 3 }]);
    const n = await countDocumentViewers(EXPORT_ID);
    expect(n).toBe(3);
    expect(h.selectMock).toHaveBeenCalledTimes(1);
  });

  it("coerces a missing/null count to 0", async () => {
    h.whereMock.mockResolvedValue([]);
    const n = await countDocumentViewers(EXPORT_ID);
    expect(n).toBe(0);
  });
});
