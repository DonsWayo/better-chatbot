import { describe, it, expect, vi, beforeEach } from "vitest";

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
  beforeEach(() => { vi.clearAllMocks(); });

  it("throws when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { addExportChatCommentAction } = await import("./actions");
    await expect(
      addExportChatCommentAction({ exportId: "e1", content: {} as any }),
    ).rejects.toThrow(/User not found/i);
  });

  it("inserts a comment for authenticated user", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    insertCommentMock.mockResolvedValueOnce({ id: "c1", exportId: "e1" });
    const { addExportChatCommentAction } = await import("./actions");
    const result = await addExportChatCommentAction({
      exportId: "e1",
      content: { type: "doc", content: [] } as any,
    });
    expect(result.id).toBe("c1");
    expect(insertCommentMock).toHaveBeenCalledWith(
      expect.objectContaining({ exportId: "e1", authorId: "u1" }),
    );
  });
});
