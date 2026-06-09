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

  it("passes content object to repository", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    chatExportRepositoryMock.insertComment.mockResolvedValue(undefined);
    const content = { type: "doc" as const, content: [{ type: "paragraph", content: [] }] };

    await addExportChatCommentAction({ exportId: "exp-1", content });

    expect(chatExportRepositoryMock.insertComment).toHaveBeenCalledWith(
      expect.objectContaining({ content }),
    );
  });

  it("omits parentId when not provided", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    chatExportRepositoryMock.insertComment.mockResolvedValue(undefined);

    await addExportChatCommentAction({
      exportId: "exp-1",
      content: { type: "doc", content: [] },
    });

    expect(chatExportRepositoryMock.insertComment).toHaveBeenCalledWith(
      expect.not.objectContaining({ parentId: expect.anything() }),
    );
  });

  it("passes correct exportId when multiple calls differ", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    chatExportRepositoryMock.insertComment.mockResolvedValue(undefined);

    await addExportChatCommentAction({
      exportId: "export-abc",
      content: { type: "doc", content: [] },
    });

    expect(chatExportRepositoryMock.insertComment).toHaveBeenCalledWith(
      expect.objectContaining({ exportId: "export-abc" }),
    );
  });

  it("calls insertComment exactly once per action call", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    chatExportRepositoryMock.insertComment.mockResolvedValue(undefined);

    await addExportChatCommentAction({
      exportId: "exp-1",
      content: { type: "doc", content: [] },
    });

    expect(chatExportRepositoryMock.insertComment).toHaveBeenCalledTimes(1);
  });

  it("propagates repository rejection", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    chatExportRepositoryMock.insertComment.mockRejectedValue(new Error("DB error"));

    await expect(
      addExportChatCommentAction({
        exportId: "exp-1",
        content: { type: "doc", content: [] },
      }),
    ).rejects.toThrow("DB error");
  });

  it("throws when session has no user", async () => {
    getSessionMock.mockResolvedValue({ user: null });
    await expect(
      addExportChatCommentAction({
        exportId: "exp-1",
        content: { type: "doc", content: [] },
      }),
    ).rejects.toThrow();
  });

  it("throws when session user has no id", async () => {
    getSessionMock.mockResolvedValue({ user: {} });
    await expect(
      addExportChatCommentAction({
        exportId: "exp-1",
        content: { type: "doc", content: [] },
      }),
    ).rejects.toThrow();
  });

  it("getSession is called exactly once per action call", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    chatExportRepositoryMock.insertComment.mockResolvedValue(undefined);
    await addExportChatCommentAction({
      exportId: "exp-1",
      content: { type: "doc", content: [] },
    });
    expect(getSessionMock).toHaveBeenCalledTimes(1);
  });
});
