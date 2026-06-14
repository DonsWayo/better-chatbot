import { describe, expect, it } from "vitest";
import type { DocumentCommentWithUser } from "lib/db/pg/repositories/document-comment-repository.pg";
import { countComments, mergeComments } from "./comments-merge";

function comment(
  id: string,
  over: Partial<DocumentCommentWithUser> = {},
): DocumentCommentWithUser {
  return {
    id,
    documentId: "doc-1",
    parentId: null,
    authorId: "u-1",
    content: { type: "doc", content: [] },
    createdAt: new Date(),
    updatedAt: new Date(),
    authorName: "Ana",
    ...over,
  };
}

describe("countComments", () => {
  it("counts top-level + nested replies at every depth", () => {
    const tree = [
      comment("a", { replies: [comment("a1"), comment("a2")] }),
      comment("b"),
    ];
    expect(countComments(tree)).toBe(4);
  });

  it("returns 0 for empty / undefined", () => {
    expect(countComments(undefined)).toBe(0);
    expect(countComments([])).toBe(0);
  });
});

describe("mergeComments", () => {
  it("returns the server list when there are no optimistic comments", () => {
    const server = [comment("a")];
    expect(mergeComments(server, [])).toBe(server);
    expect(mergeComments(server, undefined)).toBe(server);
  });

  it("keeps an optimistic top-level comment the server hasn't seen yet", () => {
    const server = [comment("a")];
    const optimistic = [comment("opt-1")];
    const merged = mergeComments(server, optimistic);
    expect(merged.map((c) => c.id)).toEqual(["a", "opt-1"]);
  });

  it("drops an optimistic comment once the server returns it (server wins)", () => {
    const server = [comment("a"), comment("opt-1", { authorName: "Server" })];
    const optimistic = [comment("opt-1", { authorName: "Optimistic" })];
    const merged = mergeComments(server, optimistic);
    expect(merged).toHaveLength(2);
    expect(merged.find((c) => c.id === "opt-1")?.authorName).toBe("Server");
  });

  it("grafts an optimistic reply under its still-present server parent", () => {
    const server = [comment("a")];
    const optimistic = [comment("opt-r", { parentId: "a" })];
    const merged = mergeComments(server, optimistic);
    expect(merged).toHaveLength(1);
    expect(merged[0].replies?.map((r) => r.id)).toEqual(["opt-r"]);
  });

  it("drops an orphan optimistic reply whose parent vanished server-side", () => {
    const server = [comment("b")]; // parent "a" no longer present
    const optimistic = [comment("opt-r", { parentId: "a" })];
    const merged = mergeComments(server, optimistic);
    expect(merged.map((c) => c.id)).toEqual(["b"]);
    expect(merged[0].replies ?? []).toHaveLength(0);
  });

  it("does not mutate its inputs", () => {
    const server = [comment("a")];
    const optimistic = [comment("opt-r", { parentId: "a" })];
    mergeComments(server, optimistic);
    expect(server[0].replies).toBeUndefined();
  });
});
