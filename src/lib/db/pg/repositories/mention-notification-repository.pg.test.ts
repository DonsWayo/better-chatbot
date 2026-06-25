import { beforeEach, describe, expect, it, vi } from "vitest";

// Unit tests for pgMentionNotificationRepository.
// Uses the same Drizzle chain mock pattern as api-key-repository.pg.test.ts.

const { insertValuesMock, updateSetMock, selectQueue } = vi.hoisted(() => {
  const selectQueue: unknown[][] = [];
  return {
    insertValuesMock: vi.fn(),
    updateSetMock: vi.fn(),
    selectQueue,
  };
});

vi.mock("../db.pg", () => {
  const nextSelect = () => Promise.resolve(selectQueue.shift() ?? []);

  // Supports:
  //   select().from().as(alias)                                   → subquery alias object
  //   select().from().leftJoin().leftJoin().where().orderBy().limit()  → rows
  const terminal = () => ({
    orderBy: () => ({ limit: () => nextSelect() }),
    limit: () => nextSelect(),
  });
  const fromResult = (alias?: string) => ({
    as: (a: string) => ({ id: `${a}.id`, name: `${a}.name`, image: `${a}.image` }),
    leftJoin: () => ({
      leftJoin: () => ({
        where: () => terminal(),
      }),
      where: () => terminal(),
    }),
    where: () => terminal(),
  });
  const selectChain = () => ({
    from: () => fromResult(),
  });

  const insert = () => ({
    values: (v: unknown) => {
      insertValuesMock(v);
      return Promise.resolve();
    },
  });

  const update = () => ({
    set: (v: unknown) => {
      updateSetMock(v);
      return {
        where: () => Promise.resolve(),
      };
    },
  });

  return { pgDb: { select: selectChain, insert, update } };
});

vi.mock("../schema.pg", () => ({
  AsafeMentionNotificationTable: {
    id: "mn.id",
    recipientId: "mn.recipientId",
    authorId: "mn.authorId",
    documentId: "mn.documentId",
    commentId: "mn.commentId",
    isRead: "mn.isRead",
    createdAt: "mn.createdAt",
  },
  AsafeDocumentTable: { id: "doc.id", title: "doc.title" },
  UserTable: { id: "user.id", name: "user.name", image: "user.image" },
}));

vi.mock("drizzle-orm", () => ({
  and: vi.fn((...args) => `and(${args.join(",")})`),
  eq: vi.fn((a, b) => `${a}=${b}`),
  inArray: vi.fn((col, arr) => `${col} IN [${arr}]`),
  desc: vi.fn((col) => `desc(${col})`),
}));

import { pgMentionNotificationRepository } from "./mention-notification-repository.pg";

beforeEach(() => {
  vi.clearAllMocks();
  selectQueue.length = 0;
});

describe("insertMentions", () => {
  it("calls db.insert with the provided mention rows", async () => {
    const mentions = [
      { recipientId: "r1", authorId: "a1", documentId: "d1", commentId: "c1" },
      { recipientId: "r2", authorId: "a1", documentId: "d1", commentId: "c1" },
    ];
    await pgMentionNotificationRepository.insertMentions(mentions);
    expect(insertValuesMock).toHaveBeenCalledTimes(1);
    expect(insertValuesMock).toHaveBeenCalledWith(mentions);
  });

  it("is a no-op when the array is empty", async () => {
    await pgMentionNotificationRepository.insertMentions([]);
    expect(insertValuesMock).not.toHaveBeenCalled();
  });
});

describe("getUnreadForUser", () => {
  it("returns mapped rows with fallback values for null author/title", async () => {
    selectQueue.push([
      {
        id: "mn-1",
        recipientId: "r1",
        authorId: "a1",
        authorName: null,
        authorImage: null,
        documentId: "d1",
        documentTitle: null,
        commentId: "c1",
        isRead: false,
        createdAt: new Date("2026-01-01"),
      },
    ]);

    const results = await pgMentionNotificationRepository.getUnreadForUser("r1");
    expect(results).toHaveLength(1);
    expect(results[0].authorName).toBe("");
    expect(results[0].documentTitle).toBe("Untitled");
    expect(results[0].authorImage).toBeUndefined();
  });

  it("maps author name and document title when present", async () => {
    selectQueue.push([
      {
        id: "mn-2",
        recipientId: "r1",
        authorId: "a2",
        authorName: "Alice",
        authorImage: "https://cdn/img.jpg",
        documentId: "d2",
        documentTitle: "My Doc",
        commentId: "c2",
        isRead: false,
        createdAt: new Date("2026-06-01"),
      },
    ]);

    const results = await pgMentionNotificationRepository.getUnreadForUser("r1");
    expect(results[0].authorName).toBe("Alice");
    expect(results[0].documentTitle).toBe("My Doc");
    expect(results[0].authorImage).toBe("https://cdn/img.jpg");
  });

  it("returns empty array when no rows", async () => {
    selectQueue.push([]);
    const results = await pgMentionNotificationRepository.getUnreadForUser("r1");
    expect(results).toEqual([]);
  });
});

describe("markRead", () => {
  it("calls db.update with isRead=true", async () => {
    await pgMentionNotificationRepository.markRead("u1", ["mn-1", "mn-2"]);
    expect(updateSetMock).toHaveBeenCalledWith({ isRead: true });
  });

  it("is a no-op when ids array is empty", async () => {
    await pgMentionNotificationRepository.markRead("u1", []);
    expect(updateSetMock).not.toHaveBeenCalled();
  });
});

describe("markReadForDocument", () => {
  it("calls db.update with isRead=true scoped to a document", async () => {
    await pgMentionNotificationRepository.markReadForDocument("u1", "doc-1");
    expect(updateSetMock).toHaveBeenCalledWith({ isRead: true });
  });
});
