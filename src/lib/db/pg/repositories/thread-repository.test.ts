import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Vitest unit tests for pgChatRepository (thread/chat operations).
//
// The Drizzle pgDb is mocked entirely — no live Postgres connection is needed.
// Read results are driven by a FIFO queue (selectQueue). Insert/update/delete
// call-args are captured by dedicated mock functions so tests can assert on
// exactly what values hit the DB layer.
//
// Security invariants tested:
//   • selectThread does NOT filter by userId — it is an internal primitive.
//     Use checkAccess to enforce ownership.
//   • checkAccess enforces userId ownership (cross-user denied, owner allowed).
//   • deleteThread is keyed only by thread id (FK cascade handles safety).
//   • deleteAllThreads & deleteUnarchivedThreads scope to userId.
// ---------------------------------------------------------------------------

const {
  selectQueue,
  insertValuesMock,
  insertValuesReturningMock,
  updateSetMock,
  updateWhereReturningMock,
  deleteWhereMock,
} = vi.hoisted(() => ({
  selectQueue: [] as unknown[][],
  insertValuesMock: vi.fn(),
  insertValuesReturningMock: vi.fn(),
  updateSetMock: vi.fn(),
  updateWhereReturningMock: vi.fn(),
  deleteWhereMock: vi.fn(),
}));

// Build a chainable Drizzle-shaped mock.
// Every terminal step resolves from selectQueue.shift() ?? [].
vi.mock("../db.pg", () => {
  const nextSelect = () => Promise.resolve(selectQueue.shift() ?? []);

  // select().from().where().[orderBy|limit|then]
  //         .from().leftJoin().where().[groupBy]
  const selectChain = () => ({
    from: () => ({
      where: () => ({
        orderBy: () => nextSelect(),
        limit: () => nextSelect(),
        groupBy: () => nextSelect(),
        then: (r: (v: unknown) => unknown) => nextSelect().then(r),
      }),
      leftJoin: () => ({
        where: () => ({
          then: (r: (v: unknown) => unknown) => nextSelect().then(r),
          groupBy: () => ({
            orderBy: () => nextSelect(),
          }),
        }),
      }),
      // select().from().orderBy() — used by selectMessagesByThreadId
      orderBy: () => nextSelect(),
    }),
  });

  // select() with custom column list — same chain
  const select = (cols?: unknown) => {
    void cols;
    return selectChain();
  };

  // insert().values(v).returning()
  const insert = () => ({
    values: (v: unknown) => {
      insertValuesMock(v);
      return {
        returning: () => insertValuesReturningMock(),
        onConflictDoUpdate: () => ({
          returning: () => insertValuesReturningMock(),
        }),
      };
    },
  });

  // update().set(v).where().returning()
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

  // delete().where(...)  — awaitable
  const del = () => ({
    where: (...args: unknown[]) => {
      deleteWhereMock(...args);
      return Promise.resolve();
    },
  });

  return { pgDb: { select, insert, update, delete: del } };
});

// Import repository AFTER the mock is registered.
import { pgChatRepository as repo } from "./chat-repository.pg";

// ---------------------------------------------------------------------------
// Fixture UUIDs
// ---------------------------------------------------------------------------
const OWNER = "aaaaaaaa-0000-0000-0000-000000000001";
const OTHER = "bbbbbbbb-0000-0000-0000-000000000002";
const THREAD = "cccccccc-0000-0000-0000-000000000003";
const MSG_A = "msg-a-111";
const MSG_B = "msg-b-222";

function makeThread(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: THREAD,
    title: "Test thread",
    userId: OWNER,
    createdAt: new Date("2025-01-01T00:00:00Z"),
    ...overrides,
  };
}

function makeMessage(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: MSG_A,
    threadId: THREAD,
    role: "user",
    parts: [{ type: "text", text: "hello" }],
    metadata: null,
    createdAt: new Date("2025-01-01T00:01:00Z"),
    ...overrides,
  };
}

beforeEach(() => {
  // resetAllMocks flushes unexhausted mockReturnValueOnce queues in addition to
  // clearing call history — this prevents mock bleed across tests.
  vi.resetAllMocks();
  selectQueue.length = 0;
});

// ===========================================================================
// insertThread
// ===========================================================================
describe("insertThread", () => {
  it("persists title and userId and returns the DB row", async () => {
    const row = makeThread();
    insertValuesReturningMock.mockReturnValueOnce([row]);

    const result = await repo.insertThread({
      id: THREAD,
      title: "Test thread",
      userId: OWNER,
    });

    expect(result).toEqual(row);

    const persisted = insertValuesMock.mock.calls[0][0] as Record<
      string,
      unknown
    >;
    expect(persisted.title).toBe("Test thread");
    expect(persisted.userId).toBe(OWNER);
    expect(persisted.id).toBe(THREAD);
  });

  it("does not leak another user's id into the persisted row", async () => {
    insertValuesReturningMock.mockReturnValueOnce([makeThread()]);

    await repo.insertThread({ id: THREAD, title: "Mine", userId: OWNER });

    const persisted = insertValuesMock.mock.calls[0][0] as Record<
      string,
      unknown
    >;
    expect(persisted.userId).toBe(OWNER);
    expect(persisted.userId).not.toBe(OTHER);
  });
});

// ===========================================================================
// selectThread (internal primitive — no userId filter by design)
// ===========================================================================
describe("selectThread", () => {
  it("returns the thread row when found", async () => {
    const row = makeThread();
    selectQueue.push([row]);

    const result = await repo.selectThread(THREAD);
    expect(result).toEqual(row);
  });

  it("returns undefined/null-ish when the thread does not exist", async () => {
    selectQueue.push([]);
    const result = await repo.selectThread("nonexistent-id");
    // Drizzle destructuring [result] of an empty array → undefined
    expect(result).toBeUndefined();
  });
});

// ===========================================================================
// checkAccess — the user-scoped security gate
// ===========================================================================
describe("checkAccess", () => {
  it("grants access when userId matches thread owner", async () => {
    // checkAccess does: SELECT userId FROM chat_thread WHERE id=? AND userId=?
    selectQueue.push([{ userId: OWNER }]);
    const allowed = await repo.checkAccess(THREAD, OWNER);
    expect(allowed).toBe(true);
  });

  it("denies access when userId does NOT match thread owner", async () => {
    selectQueue.push([]);
    const allowed = await repo.checkAccess(THREAD, OTHER);
    expect(allowed).toBe(false);
  });

  it("denies access for a nonexistent thread", async () => {
    selectQueue.push([]);
    const allowed = await repo.checkAccess("no-such-thread", OWNER);
    expect(allowed).toBe(false);
  });

  it("never grants cross-user access even if user ids are similar", async () => {
    const SIMILAR = OWNER.slice(0, -1) + "2";
    selectQueue.push([]);
    const allowed = await repo.checkAccess(THREAD, SIMILAR);
    expect(allowed).toBe(false);
  });
});

// ===========================================================================
// selectThreadsByUserId
// ===========================================================================
describe("selectThreadsByUserId", () => {
  it("returns threads only for the given userId", async () => {
    const rows = [
      {
        threadId: THREAD,
        title: "T1",
        createdAt: new Date(),
        userId: OWNER,
        last_message_at: null,
      },
    ];
    selectQueue.push(rows);

    const result = await repo.selectThreadsByUserId(OWNER);
    expect(result).toHaveLength(1);
    expect(result[0].userId).toBe(OWNER);
  });

  it("maps lastMessageAt to 0 when there are no messages", async () => {
    selectQueue.push([
      {
        threadId: THREAD,
        title: "Empty",
        createdAt: new Date(),
        userId: OWNER,
        lastMessageAt: null,
      },
    ]);

    const result = await repo.selectThreadsByUserId(OWNER);
    expect(result[0].lastMessageAt).toBe(0);
  });

  it("maps lastMessageAt to a numeric epoch when messages exist", async () => {
    const ts = "2025-06-01T12:00:00.000Z";
    selectQueue.push([
      {
        threadId: THREAD,
        title: "Active",
        createdAt: new Date(),
        userId: OWNER,
        lastMessageAt: ts,
      },
    ]);

    const result = await repo.selectThreadsByUserId(OWNER);
    expect(result[0].lastMessageAt).toBe(new Date(ts).getTime());
    expect(typeof result[0].lastMessageAt).toBe("number");
  });

  it("returns an empty array when the user has no threads", async () => {
    selectQueue.push([]);
    const result = await repo.selectThreadsByUserId(OWNER);
    expect(result).toEqual([]);
  });
});

// ===========================================================================
// updateThread
// ===========================================================================
describe("updateThread", () => {
  it("updates only the title field and returns the updated row", async () => {
    const updated = makeThread({ title: "New title" });
    updateWhereReturningMock.mockReturnValueOnce([updated]);

    const result = await repo.updateThread(THREAD, { title: "New title" });

    expect(result.title).toBe("New title");
    const set = updateSetMock.mock.calls[0][0] as Record<string, unknown>;
    expect(set.title).toBe("New title");
    // id and createdAt must NOT appear in the SET clause
    expect(set.id).toBeUndefined();
    expect(set.createdAt).toBeUndefined();
  });

  it("accepts a partial update with no title change (undefined passthrough)", async () => {
    updateWhereReturningMock.mockReturnValueOnce([makeThread()]);
    await repo.updateThread(THREAD, {});
    // Should still call the DB with an empty/undefined title
    expect(updateSetMock).toHaveBeenCalledTimes(1);
  });
});

// ===========================================================================
// upsertThread
// ===========================================================================
describe("upsertThread", () => {
  it("inserts a new thread and returns the row", async () => {
    const row = makeThread();
    insertValuesReturningMock.mockReturnValueOnce([row]);

    const result = await repo.upsertThread({
      id: THREAD,
      title: "Test",
      userId: OWNER,
    });

    expect(result).toEqual(row);
    expect(insertValuesMock).toHaveBeenCalledTimes(1);
  });

  it("on conflict updates only the title", async () => {
    const updated = makeThread({ title: "Updated title" });
    insertValuesReturningMock.mockReturnValueOnce([updated]);

    const result = await repo.upsertThread({
      id: THREAD,
      title: "Updated title",
      userId: OWNER,
    });

    expect(result.title).toBe("Updated title");
  });
});

// ===========================================================================
// deleteThread — cascades messages and archive items first
// ===========================================================================
describe("deleteThread", () => {
  it("deletes messages, archive items, and the thread in order", async () => {
    await repo.deleteThread(THREAD);

    // delete is called 3 times: ChatMessageTable, ArchiveItemTable, ChatThreadTable
    expect(deleteWhereMock).toHaveBeenCalledTimes(3);
  });

  it("does NOT require a userId parameter (caller must gate with checkAccess)", async () => {
    // The method signature is deleteThread(id: string) — no userId.
    // This is intentional: API routes authenticate before calling this.
    await repo.deleteThread(THREAD);
    expect(deleteWhereMock).toHaveBeenCalledTimes(3);
  });
});

// ===========================================================================
// deleteAllThreads — must scope to userId
// ===========================================================================
describe("deleteAllThreads", () => {
  it("fetches only the calling user's threads before deleting", async () => {
    // selectThreadsByUserId returns 2 thread ids belonging to OWNER
    selectQueue.push([{ id: THREAD }, { id: "thread-2" }]);

    await repo.deleteAllThreads(OWNER);

    // deleteThread internally calls delete 3 times per thread, so 6 total
    expect(deleteWhereMock).toHaveBeenCalledTimes(6);
  });

  it("does nothing when the user has no threads", async () => {
    selectQueue.push([]);
    await repo.deleteAllThreads(OWNER);
    expect(deleteWhereMock).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// deleteUnarchivedThreads — should only delete threads NOT in any archive
// ===========================================================================
describe("deleteUnarchivedThreads", () => {
  it("deletes only unarchived threads for the given user", async () => {
    selectQueue.push([{ id: THREAD }]);

    await repo.deleteUnarchivedThreads(OWNER);

    expect(deleteWhereMock).toHaveBeenCalledTimes(3);
  });

  it("leaves archived threads untouched", async () => {
    // When all threads are archived, leftJoin WHERE archiveItem IS NULL returns []
    selectQueue.push([]);
    await repo.deleteUnarchivedThreads(OWNER);
    expect(deleteWhereMock).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// insertMessage
// ===========================================================================
describe("insertMessage", () => {
  it("persists all required message fields and returns the DB row", async () => {
    const msg = makeMessage();
    insertValuesReturningMock.mockReturnValueOnce([msg]);

    const result = await repo.insertMessage({
      id: MSG_A,
      threadId: THREAD,
      role: "user",
      parts: [{ type: "text", text: "hello" }],
    });

    expect(result.id).toBe(MSG_A);
    expect(result.threadId).toBe(THREAD);

    const persisted = insertValuesMock.mock.calls[0][0] as Record<
      string,
      unknown
    >;
    expect(persisted.id).toBe(MSG_A);
    expect(persisted.threadId).toBe(THREAD);
    expect(persisted.role).toBe("user");
  });
});

// ===========================================================================
// upsertMessage
// ===========================================================================
describe("upsertMessage", () => {
  it("upserts and returns the message row", async () => {
    const msg = makeMessage({ role: "assistant" });
    insertValuesReturningMock.mockReturnValueOnce([msg]);

    const result = await repo.upsertMessage({
      id: MSG_A,
      threadId: THREAD,
      role: "assistant",
      parts: [{ type: "text", text: "hi" }],
    });

    expect(result.role).toBe("assistant");
  });

  it("on conflict updates parts and metadata only — persisted values include parts and metadata", async () => {
    const updatedParts = [{ type: "text", text: "updated" }];
    const updated = makeMessage({ parts: updatedParts });
    insertValuesReturningMock.mockReturnValueOnce([updated]);

    const result = await repo.upsertMessage({
      id: MSG_A,
      threadId: THREAD,
      role: "assistant",
      parts: updatedParts as never,
      metadata: { chatModel: { provider: "openrouter", model: "gpt-4o" } },
    });

    expect(result.parts).toEqual(updatedParts);

    // The values() call must include parts and metadata (the conflict update set)
    const persisted = insertValuesMock.mock.calls[0][0] as Record<
      string,
      unknown
    >;
    expect(persisted.parts).toEqual(updatedParts);
    expect(persisted.metadata).toBeDefined();
  });
});

// ===========================================================================
// selectMessagesByThreadId
// ===========================================================================
describe("selectMessagesByThreadId", () => {
  it("returns all messages for the given threadId ordered by createdAt", async () => {
    const msgs = [
      makeMessage({ id: MSG_A }),
      makeMessage({ id: MSG_B, createdAt: new Date("2025-01-01T00:02:00Z") }),
    ];
    selectQueue.push(msgs);

    const result = await repo.selectMessagesByThreadId(THREAD);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe(MSG_A);
    expect(result[1].id).toBe(MSG_B);
  });

  it("returns an empty array when the thread has no messages", async () => {
    selectQueue.push([]);
    const result = await repo.selectMessagesByThreadId(THREAD);
    expect(result).toEqual([]);
  });
});

// ===========================================================================
// selectMessageById
// ===========================================================================
describe("selectMessageById", () => {
  it("returns the message when found", async () => {
    const msg = makeMessage();
    selectQueue.push([msg]);

    const result = await repo.selectMessageById(MSG_A);
    expect(result?.id).toBe(MSG_A);
  });

  it("returns null when the message does not exist", async () => {
    selectQueue.push([]);
    const result = await repo.selectMessageById("no-such-message");
    expect(result).toBeNull();
  });
});

// ===========================================================================
// deleteChatMessage
// ===========================================================================
describe("deleteChatMessage", () => {
  it("issues exactly one delete keyed by message id", async () => {
    await repo.deleteChatMessage(MSG_A);
    expect(deleteWhereMock).toHaveBeenCalledTimes(1);
  });
});

// ===========================================================================
// deleteMessagesByChatIdAfterTimestamp
// ===========================================================================
describe("deleteMessagesByChatIdAfterTimestamp", () => {
  it("deletes messages in the same thread at or after the target message's timestamp", async () => {
    const pivot = makeMessage({ createdAt: new Date("2025-06-01T10:00:00Z") });
    selectQueue.push([pivot]);

    await repo.deleteMessagesByChatIdAfterTimestamp(MSG_A);

    expect(deleteWhereMock).toHaveBeenCalledTimes(1);
  });

  it("does nothing when the pivot message does not exist", async () => {
    selectQueue.push([]);
    await repo.deleteMessagesByChatIdAfterTimestamp("ghost-id");
    expect(deleteWhereMock).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// insertMessages (bulk)
// ===========================================================================
describe("insertMessages", () => {
  it("bulk-inserts multiple messages and returns all rows", async () => {
    const rows = [makeMessage({ id: MSG_A }), makeMessage({ id: MSG_B })];
    insertValuesReturningMock.mockReturnValueOnce(rows);

    const result = await repo.insertMessages([
      { id: MSG_A, threadId: THREAD, role: "user", parts: [] },
      { id: MSG_B, threadId: THREAD, role: "assistant", parts: [] },
    ]);

    expect(result).toHaveLength(2);
    expect(result.map((m) => m.id)).toEqual([MSG_A, MSG_B]);
  });
});

// ===========================================================================
// selectThreadDetails (join with UserTable)
// ===========================================================================
describe("selectThreadDetails", () => {
  it("returns null for a blank id without querying", async () => {
    const result = await repo.selectThreadDetails("");
    expect(result).toBeNull();
    // selectQueue untouched — no DB call made
    expect(selectQueue.length).toBe(0);
  });

  it("returns null when the thread is not found", async () => {
    selectQueue.push([]);
    const result = await repo.selectThreadDetails("no-thread");
    expect(result).toBeNull();
  });

  it("returns a merged thread + messages when found", async () => {
    const joinRow = {
      chat_thread: makeThread(),
      user: { preferences: { theme: "dark" } },
    };
    const msgs = [makeMessage()];

    selectQueue.push([joinRow]);
    selectQueue.push(msgs); // selectMessagesByThreadId is called next

    const result = await repo.selectThreadDetails(THREAD);
    expect(result?.id).toBe(THREAD);
    expect(result?.userPreferences).toEqual({ theme: "dark" });
    expect(result?.messages).toHaveLength(1);
  });

  it("omits userPreferences when the user row is null (anonymous thread)", async () => {
    const joinRow = { chat_thread: makeThread(), user: null };
    selectQueue.push([joinRow]);
    selectQueue.push([]);

    const result = await repo.selectThreadDetails(THREAD);
    expect(result?.userPreferences).toBeUndefined();
  });
});
