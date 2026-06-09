import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const { getSessionMock, chatExportRepositoryMock } = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  chatExportRepositoryMock: {
    insertComment: vi.fn(),
  },
}));

vi.mock("auth/server", () => ({ getSession: getSessionMock }));
vi.mock("lib/db/repository", () => ({
  chatExportRepository: chatExportRepositoryMock,
}));

import { addExportChatCommentAction } from "./actions";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("addExportChatCommentAction", () => {
  it("throws when no session", async () => {
    getSessionMock.mockResolvedValue(null);
    await expect(
      addExportChatCommentAction({
        exportId: "exp-1",
        content: { type: "doc", content: [] },
      }),
    ).rejects.toThrow("User not found");
  });

  it("inserts comment with userId from session", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-42" } });
    chatExportRepositoryMock.insertComment.mockResolvedValue(undefined);

    await addExportChatCommentAction({
      exportId: "exp-1",
      content: { type: "doc", content: [] },
    });

    expect(chatExportRepositoryMock.insertComment).toHaveBeenCalledWith(
      expect.objectContaining({
        exportId: "exp-1",
        authorId: "user-42",
      }),
    );
  });

  it("passes parentId when provided", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    chatExportRepositoryMock.insertComment.mockResolvedValue(undefined);

    await addExportChatCommentAction({
      exportId: "exp-1",
      content: { type: "doc", content: [] },
      parentId: "parent-comment-123",
    });

    expect(chatExportRepositoryMock.insertComment).toHaveBeenCalledWith(
      expect.objectContaining({
        parentId: "parent-comment-123",
      }),
    );
  });

  it("returns result from repository", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    chatExportRepositoryMock.insertComment.mockResolvedValue("comment-id");

    const result = await addExportChatCommentAction({
      exportId: "exp-1",
      content: { type: "doc", content: [] },
    });

    expect(result).toBe("comment-id");
  });
});
