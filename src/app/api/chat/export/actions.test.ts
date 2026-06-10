import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSessionMock, insertCommentMock } = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  insertCommentMock: vi.fn(),
}));

vi.mock("auth/server", () => ({ getSession: getSessionMock }));
vi.mock("lib/db/repository", () => ({
  chatExportRepository: { insertComment: insertCommentMock },
}));
vi.mock("app-types/chat-export", () => ({
  ChatExportCommentCreateSchema: {
    parse: (d: any) => d,
  },
}));

describe("addExportChatCommentAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { addExportChatCommentAction } = await import("./actions");
    await expect(
      addExportChatCommentAction({ exportId: "e1", content: {} as any }),
    ).rejects.toThrow(/User not found/i);
  });

  it("never calls insertComment when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { addExportChatCommentAction } = await import("./actions");
    await addExportChatCommentAction({
      exportId: "e1",
      content: {} as any,
    }).catch(() => {});
    expect(insertCommentMock).not.toHaveBeenCalled();
  });

  it("inserts a comment for authenticated user", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    insertCommentMock.mockResolvedValueOnce({ id: "c1", exportId: "e1" });
    const { addExportChatCommentAction } = await import("./actions");
    // Repository insertComment is typed Promise<void>, but the action returns
    // its value verbatim; the mock resolves an object so assert on the passthrough.
    const result = (await addExportChatCommentAction({
      exportId: "e1",
      content: { type: "doc", content: [] } as any,
    })) as unknown as { id: string };
    expect(result.id).toBe("c1");
    expect(insertCommentMock).toHaveBeenCalledWith(
      expect.objectContaining({ exportId: "e1", authorId: "u1" }),
    );
  });

  it("includes authorId from session user in call", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-author-xyz" } });
    insertCommentMock.mockResolvedValueOnce({ id: "c2" });
    const { addExportChatCommentAction } = await import("./actions");
    await addExportChatCommentAction({ exportId: "e-99", content: {} as any });
    expect(insertCommentMock).toHaveBeenCalledWith(
      expect.objectContaining({ authorId: "user-author-xyz" }),
    );
  });

  it("passes exportId in the insert call", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    insertCommentMock.mockResolvedValueOnce({ id: "c2" });
    const { addExportChatCommentAction } = await import("./actions");
    await addExportChatCommentAction({
      exportId: "export-unique-123",
      content: {} as any,
    });
    expect(insertCommentMock).toHaveBeenCalledWith(
      expect.objectContaining({ exportId: "export-unique-123" }),
    );
  });

  it("passes parentId when provided", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    insertCommentMock.mockResolvedValueOnce({ id: "c3", parentId: "p1" });
    const { addExportChatCommentAction } = await import("./actions");
    await addExportChatCommentAction({
      exportId: "e1",
      content: {} as any,
      parentId: "p1",
    });
    expect(insertCommentMock).toHaveBeenCalledWith(
      expect.objectContaining({ parentId: "p1" }),
    );
  });

  it("returns the result from insertComment directly", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    const EXPECTED = {
      id: "c9",
      exportId: "e1",
      authorId: "u1",
      createdAt: "2025-01-01",
    };
    insertCommentMock.mockResolvedValueOnce(EXPECTED);
    const { addExportChatCommentAction } = await import("./actions");
    const result = await addExportChatCommentAction({
      exportId: "e1",
      content: {} as any,
    });
    expect(result).toEqual(EXPECTED);
  });

  it("calls insertComment exactly once per invocation", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    insertCommentMock.mockResolvedValueOnce({ id: "c-x" });
    const { addExportChatCommentAction } = await import("./actions");
    await addExportChatCommentAction({ exportId: "e1", content: {} as any });
    expect(insertCommentMock).toHaveBeenCalledTimes(1);
  });

  it("propagates insertComment error to caller", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    insertCommentMock.mockRejectedValueOnce(new Error("insert failed"));
    const { addExportChatCommentAction } = await import("./actions");
    await expect(
      addExportChatCommentAction({ exportId: "e1", content: {} as any }),
    ).rejects.toThrow("insert failed");
  });

  it("does not pass parentId when not provided (undefined)", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    insertCommentMock.mockResolvedValueOnce({ id: "c1" });
    const { addExportChatCommentAction } = await import("./actions");
    await addExportChatCommentAction({ exportId: "e1", content: {} as any });
    const callArg = insertCommentMock.mock.calls[0][0];
    expect(callArg.parentId === undefined || callArg.parentId === null).toBe(
      true,
    );
  });

  it("getSession called exactly once per invocation", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    insertCommentMock.mockResolvedValueOnce({ id: "c1" });
    const { addExportChatCommentAction } = await import("./actions");
    await addExportChatCommentAction({ exportId: "e1", content: {} as any });
    expect(getSessionMock).toHaveBeenCalledTimes(1);
  });

  it("content is forwarded to insertComment in the insert payload", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    insertCommentMock.mockResolvedValueOnce({ id: "c1" });
    const content = {
      type: "doc",
      content: [{ type: "paragraph", text: "hello" }],
    };
    const { addExportChatCommentAction } = await import("./actions");
    await addExportChatCommentAction({
      exportId: "e1",
      content: content as any,
    });
    expect(insertCommentMock).toHaveBeenCalledWith(
      expect.objectContaining({ content }),
    );
  });

  it("error thrown when unauthenticated is an instance of Error", async () => {
    getSessionMock.mockResolvedValue(null);
    const { addExportChatCommentAction } = await import("./actions");
    await expect(
      addExportChatCommentAction({ exportId: "e1", content: {} as any }),
    ).rejects.toBeInstanceOf(Error);
  });
});
