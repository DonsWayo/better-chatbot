import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Drizzle mock chain ────────────────────────────────────────────────────────
// insert(AsafePresenceTable).values({...}).onConflictDoUpdate({...}) → resolves;
// the hoisted mocks let each test assert exactly what the single upsert did.

const h = vi.hoisted(() => {
  const onConflictMock = vi.fn().mockResolvedValue(undefined);
  const valuesMock = vi
    .fn()
    .mockReturnValue({ onConflictDoUpdate: onConflictMock });
  const insertMock = vi.fn().mockReturnValue({ values: valuesMock });

  return {
    insertMock,
    valuesMock,
    onConflictMock,
    getSessionMock: vi.fn(),
    canReadThreadMock: vi.fn(),
    canAccessFolderMock: vi.fn(),
  };
});

vi.mock("auth/server", () => ({ getSession: h.getSessionMock }));
vi.mock("lib/teamspaces/folders", () => ({
  canReadThread: h.canReadThreadMock,
  canAccessFolder: h.canAccessFolderMock,
}));
vi.mock("lib/db/pg/db.pg", () => ({
  pgDb: { insert: h.insertMock },
}));

import { heartbeatPresenceAction } from "./presence-actions";

const USER_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const THREAD_ID = "11111111-2222-4333-8444-555555555555";
const FOLDER_ID = "99999999-8888-4777-8666-555555555555";

beforeEach(() => {
  vi.clearAllMocks();
  h.valuesMock.mockReturnValue({ onConflictDoUpdate: h.onConflictMock });
  h.insertMock.mockReturnValue({ values: h.valuesMock });
  h.getSessionMock.mockResolvedValue({ user: { id: USER_ID } });
  h.canReadThreadMock.mockResolvedValue(true);
  h.canAccessFolderMock.mockResolvedValue(true);
});

describe("heartbeatPresenceAction — session", () => {
  it("throws Unauthorized without a session", async () => {
    h.getSessionMock.mockResolvedValue(null);
    await expect(heartbeatPresenceAction("thread", THREAD_ID)).rejects.toThrow(
      "Unauthorized",
    );
    expect(h.insertMock).not.toHaveBeenCalled();
    expect(h.canReadThreadMock).not.toHaveBeenCalled();
  });
});

describe("heartbeatPresenceAction — input validation", () => {
  it("rejects an unknown context type before touching the db", async () => {
    await expect(
      heartbeatPresenceAction("workspace" as unknown as "thread", THREAD_ID),
    ).rejects.toThrow("Invalid presence context type");
    expect(h.insertMock).not.toHaveBeenCalled();
  });

  it("rejects a non-uuid context id before touching the db", async () => {
    await expect(
      heartbeatPresenceAction("thread", "not-a-uuid"),
    ).rejects.toThrow("Invalid presence context id");
    expect(h.insertMock).not.toHaveBeenCalled();
    expect(h.canReadThreadMock).not.toHaveBeenCalled();
  });
});

describe("heartbeatPresenceAction — access gates", () => {
  it("thread context: denies when canReadThread is false", async () => {
    h.canReadThreadMock.mockResolvedValue(false);
    await expect(heartbeatPresenceAction("thread", THREAD_ID)).rejects.toThrow(
      "Forbidden",
    );
    expect(h.canReadThreadMock).toHaveBeenCalledWith(THREAD_ID, USER_ID);
    expect(h.canAccessFolderMock).not.toHaveBeenCalled();
    expect(h.insertMock).not.toHaveBeenCalled();
  });

  it("folder context: denies when canAccessFolder is false", async () => {
    h.canAccessFolderMock.mockResolvedValue(false);
    await expect(heartbeatPresenceAction("folder", FOLDER_ID)).rejects.toThrow(
      "Forbidden",
    );
    expect(h.canAccessFolderMock).toHaveBeenCalledWith(FOLDER_ID, USER_ID);
    expect(h.canReadThreadMock).not.toHaveBeenCalled();
    expect(h.insertMock).not.toHaveBeenCalled();
  });
});

describe("heartbeatPresenceAction — upsert", () => {
  it("thread heartbeat upserts one row scoped to the caller", async () => {
    await heartbeatPresenceAction("thread", THREAD_ID);

    expect(h.insertMock).toHaveBeenCalledTimes(1);
    expect(h.valuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: USER_ID,
        contextType: "thread",
        contextId: THREAD_ID,
        lastSeenAt: expect.any(Date),
      }),
    );
    const conflict = h.onConflictMock.mock.calls[0][0] as {
      target: unknown[];
      set: { lastSeenAt: Date };
    };
    expect(conflict.target).toHaveLength(3);
    expect(conflict.set.lastSeenAt).toBeInstanceOf(Date);
  });

  it("folder heartbeat goes through the folder gate then upserts", async () => {
    await heartbeatPresenceAction("folder", FOLDER_ID);

    expect(h.canAccessFolderMock).toHaveBeenCalledWith(FOLDER_ID, USER_ID);
    expect(h.valuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: USER_ID,
        contextType: "folder",
        contextId: FOLDER_ID,
      }),
    );
    expect(h.onConflictMock).toHaveBeenCalledTimes(1);
  });
});
