import type { ChatExportCommentWithUser } from "app-types/chat-export";
import { describe, expect, it } from "vitest";
import { countComments, mergeComments } from "./comments-merge";

function comment(
  id: string,
  overrides: Partial<ChatExportCommentWithUser> = {},
): ChatExportCommentWithUser {
  return {
    id,
    exportId: "ex-1",
    authorId: "u-1",
    content: { type: "doc", content: [] } as any,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    authorName: "Author",
    ...overrides,
  };
}

describe("countComments", () => {
  it("returns 0 for empty / undefined", () => {
    expect(countComments(undefined)).toBe(0);
    expect(countComments([])).toBe(0);
  });

  it("counts top-level comments", () => {
    expect(countComments([comment("a"), comment("b")])).toBe(2);
  });

  it("counts nested replies at every depth", () => {
    const tree = [
      comment("a", {
        replies: [
          comment("a1", {
            parentId: "a",
            replies: [comment("a1a", { parentId: "a1" })],
          }),
          comment("a2", { parentId: "a" }),
        ],
      }),
      comment("b"),
    ];
    // a + a1 + a1a + a2 + b = 5
    expect(countComments(tree)).toBe(5);
  });
});

describe("mergeComments", () => {
  it("returns server data unchanged when there is no optimistic state", () => {
    const server = [comment("a"), comment("b")];
    expect(mergeComments(server, [])).toBe(server);
    expect(mergeComments(server, undefined)).toBe(server);
  });

  it("reflects OTHER users' new top-level comments live from the server", () => {
    // The user only had [a] locally; the server poll now returns [a, b] where
    // b is another viewer's comment. b must appear.
    const server = [comment("a"), comment("b-other")];
    const merged = mergeComments(server, []);
    expect(merged.map((c) => c.id)).toEqual(["a", "b-other"]);
  });

  it("reflects OTHER users' new nested replies live", () => {
    const server = [
      comment("a", {
        replies: [comment("a1-other", { parentId: "a" })],
      }),
    ];
    const merged = mergeComments(server, []);
    expect(merged[0].replies?.map((r) => r.id)).toEqual(["a1-other"]);
  });

  it("reflects deletions: a comment absent from the server poll disappears", () => {
    // Previously [a, b]; server now only returns [a] (b was deleted by its
    // owner). No optimistic state → result is exactly the server tree.
    const server = [comment("a")];
    const merged = mergeComments(server, []);
    expect(merged.map((c) => c.id)).toEqual(["a"]);
  });

  it("keeps a local optimistic top-level comment the server has not seen yet", () => {
    // A poll fires mid-POST: server still only has [a]; the user's optimistic
    // comment (temp id) must NOT be dropped.
    const server = [comment("a")];
    const optimistic = [comment("optimistic-1", { authorId: "me" })];
    const merged = mergeComments(server, optimistic);
    expect(merged.map((c) => c.id)).toEqual(["a", "optimistic-1"]);
  });

  it("merges others' new comments AND keeps the local optimistic one", () => {
    // The core live-merge requirement: a poll brings in b-other while the
    // user's own optimistic comment is still pending. Both must be present.
    const server = [comment("a"), comment("b-other")];
    const optimistic = [comment("optimistic-mine", { authorId: "me" })];
    const merged = mergeComments(server, optimistic);
    expect(merged.map((c) => c.id)).toEqual([
      "a",
      "b-other",
      "optimistic-mine",
    ]);
  });

  it("drops an optimistic comment once the server returns its real row", () => {
    // Once the server tree contains the comment (by id), the optimistic copy
    // is no longer pending and is not duplicated. (Here the caller would have
    // retired it; this asserts mergeComments does not double-add a server id.)
    const server = [comment("a"), comment("real-1")];
    const optimistic = [comment("real-1", { authorId: "me" })];
    const merged = mergeComments(server, optimistic);
    expect(merged.map((c) => c.id)).toEqual(["a", "real-1"]);
  });

  it("grafts a pending optimistic reply under its still-present server parent", () => {
    const server = [comment("a", { replies: [] })];
    const optimistic = [
      comment("opt-reply", { parentId: "a", authorId: "me" }),
    ];
    const merged = mergeComments(server, optimistic);
    expect(merged[0].replies?.map((r) => r.id)).toEqual(["opt-reply"]);
  });

  it("appends an optimistic reply after existing server replies", () => {
    const server = [
      comment("a", { replies: [comment("a1-other", { parentId: "a" })] }),
    ];
    const optimistic = [
      comment("opt-reply", { parentId: "a", authorId: "me" }),
    ];
    const merged = mergeComments(server, optimistic);
    expect(merged[0].replies?.map((r) => r.id)).toEqual([
      "a1-other",
      "opt-reply",
    ]);
  });

  it("drops an orphan optimistic reply whose parent vanished server-side", () => {
    // Parent a was deleted before the reply landed; the orphan is not shown.
    const server = [comment("b")];
    const optimistic = [
      comment("opt-reply", { parentId: "a-gone", authorId: "me" }),
    ];
    const merged = mergeComments(server, optimistic);
    expect(merged.map((c) => c.id)).toEqual(["b"]);
  });

  it("does not mutate its inputs", () => {
    const server = [comment("a", { replies: [] })];
    const serverSnapshot = JSON.stringify(server);
    const optimistic = [
      comment("opt-reply", { parentId: "a", authorId: "me" }),
    ];
    mergeComments(server, optimistic);
    expect(JSON.stringify(server)).toBe(serverSnapshot);
  });
});
