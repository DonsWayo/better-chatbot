import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * ACL behaviour of the document-comment Server Actions
 * (src/app/api/documents/actions.ts):
 *   - list/create: require READ access (checkAccess readOnly=true);
 *   - delete: author OR org admin only.
 *
 * The actions wrap their logic in toActionResult, so a thrown "Forbidden"
 * surfaces as { success: false, error: "Forbidden" } rather than a throw.
 */

const h = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  checkAccessMock: vi.fn(),
  listByDocumentMock: vi.fn(),
  insertCommentMock: vi.fn(),
  getCommentOwnerMock: vi.fn(),
  deleteCommentMock: vi.fn(),
  getIsUserAdminMock: vi.fn(),
  insertMentionsMock: vi.fn(),
}));

vi.mock("auth/server", () => ({ getSession: h.getSessionMock }));
vi.mock("lib/db/repository", () => ({
  documentRepository: { checkAccess: h.checkAccessMock },
  documentCommentRepository: {
    listByDocument: h.listByDocumentMock,
    insertComment: h.insertCommentMock,
    getCommentOwner: h.getCommentOwnerMock,
    deleteComment: h.deleteCommentMock,
  },
  mentionNotificationRepository: { insertMentions: h.insertMentionsMock },
}));
vi.mock("lib/user/utils", () => ({ getIsUserAdmin: h.getIsUserAdminMock }));

import {
  createDocumentCommentAction,
  deleteDocumentCommentAction,
  listDocumentCommentsAction,
} from "./actions";

const USER = "user-1";
const OTHER = "user-2";
const DOC = "doc-1";
const CONTENT = { type: "doc", content: [{ type: "paragraph" }] };

beforeEach(() => {
  vi.clearAllMocks();
  h.getSessionMock.mockResolvedValue({ user: { id: USER, role: "user" } });
  h.checkAccessMock.mockResolvedValue(true);
  h.getIsUserAdminMock.mockReturnValue(false);
});

describe("listDocumentCommentsAction", () => {
  it("returns comments when the caller can read the doc", async () => {
    h.listByDocumentMock.mockResolvedValue([{ id: "c-1" }]);
    const result = await listDocumentCommentsAction(DOC);
    expect(result).toEqual({ success: true, data: [{ id: "c-1" }] });
    expect(h.checkAccessMock).toHaveBeenCalledWith(DOC, USER, true);
    expect(h.listByDocumentMock).toHaveBeenCalledWith(DOC, USER);
  });

  it("forbids when the caller cannot read the doc", async () => {
    h.checkAccessMock.mockResolvedValue(false);
    const result = await listDocumentCommentsAction(DOC);
    expect(result).toEqual({ success: false, error: "Forbidden" });
    expect(h.listByDocumentMock).not.toHaveBeenCalled();
  });

  it("is unauthorized without a session", async () => {
    h.getSessionMock.mockResolvedValue(null);
    const result = await listDocumentCommentsAction(DOC);
    expect(result).toEqual({ success: false, error: "Unauthorized" });
  });
});

describe("createDocumentCommentAction", () => {
  it("creates when the caller can read the doc", async () => {
    h.insertCommentMock.mockResolvedValue({ id: "new" });
    const result = await createDocumentCommentAction({
      documentId: DOC,
      content: CONTENT,
    });
    expect(result).toEqual({ success: true, data: { id: "new" } });
    expect(h.checkAccessMock).toHaveBeenCalledWith(DOC, USER, true);
    expect(h.insertCommentMock).toHaveBeenCalledWith({
      documentId: DOC,
      authorId: USER,
      parentId: null,
      content: CONTENT,
    });
  });

  it("forbids a caller who cannot read the doc", async () => {
    h.checkAccessMock.mockResolvedValue(false);
    const result = await createDocumentCommentAction({
      documentId: DOC,
      content: CONTENT,
    });
    expect(result).toEqual({ success: false, error: "Forbidden" });
    expect(h.insertCommentMock).not.toHaveBeenCalled();
  });

  it("rejects a reply whose parent belongs to another doc", async () => {
    h.getCommentOwnerMock.mockResolvedValue({
      authorId: OTHER,
      documentId: "other-doc",
    });
    const result = await createDocumentCommentAction({
      documentId: DOC,
      content: CONTENT,
      parentId: "p-1",
    });
    expect(result).toEqual({
      success: false,
      error: "Parent comment not found",
    });
    expect(h.insertCommentMock).not.toHaveBeenCalled();
  });

  it("accepts a reply whose parent belongs to the same doc", async () => {
    h.getCommentOwnerMock.mockResolvedValue({
      authorId: OTHER,
      documentId: DOC,
    });
    h.insertCommentMock.mockResolvedValue({ id: "reply" });
    const result = await createDocumentCommentAction({
      documentId: DOC,
      content: CONTENT,
      parentId: "p-1",
    });
    expect(result).toEqual({ success: true, data: { id: "reply" } });
    expect(h.insertCommentMock).toHaveBeenCalledWith(
      expect.objectContaining({ parentId: "p-1" }),
    );
  });

  it("fires mention notifications for each mentioned user", async () => {
    h.insertCommentMock.mockResolvedValue({ id: "c-mention" });
    h.insertMentionsMock.mockResolvedValue(undefined);
    const result = await createDocumentCommentAction({
      documentId: DOC,
      content: CONTENT,
      mentionedUserIds: [OTHER, "user-3"],
    });
    expect(result).toEqual({ success: true, data: { id: "c-mention" } });
    expect(h.insertMentionsMock).toHaveBeenCalledTimes(1);
    const [mentions] = h.insertMentionsMock.mock.calls[0] as [Array<{ recipientId: string }>];
    expect(mentions.map((m) => m.recipientId)).toEqual([OTHER, "user-3"]);
  });

  it("does not send a mention notification for a self-tag", async () => {
    h.insertCommentMock.mockResolvedValue({ id: "c-self" });
    h.insertMentionsMock.mockResolvedValue(undefined);
    await createDocumentCommentAction({
      documentId: DOC,
      content: CONTENT,
      mentionedUserIds: [USER],
    });
    expect(h.insertMentionsMock).not.toHaveBeenCalled();
  });

  it("skips notification call when no users are mentioned", async () => {
    h.insertCommentMock.mockResolvedValue({ id: "c-none" });
    await createDocumentCommentAction({
      documentId: DOC,
      content: CONTENT,
    });
    expect(h.insertMentionsMock).not.toHaveBeenCalled();
  });
});

describe("deleteDocumentCommentAction", () => {
  it("lets the author delete their own comment", async () => {
    h.getCommentOwnerMock.mockResolvedValue({
      authorId: USER,
      documentId: DOC,
    });
    const result = await deleteDocumentCommentAction("c-1");
    expect(result).toEqual({ success: true, data: undefined });
    expect(h.deleteCommentMock).toHaveBeenCalledWith("c-1", USER, false);
  });

  it("forbids a non-author non-admin", async () => {
    h.getCommentOwnerMock.mockResolvedValue({
      authorId: OTHER,
      documentId: DOC,
    });
    h.getIsUserAdminMock.mockReturnValue(false);
    const result = await deleteDocumentCommentAction("c-1");
    expect(result).toEqual({ success: false, error: "Forbidden" });
    expect(h.deleteCommentMock).not.toHaveBeenCalled();
  });

  it("lets an org admin delete anyone's comment (allowAnyAuthor)", async () => {
    h.getCommentOwnerMock.mockResolvedValue({
      authorId: OTHER,
      documentId: DOC,
    });
    h.getIsUserAdminMock.mockReturnValue(true);
    const result = await deleteDocumentCommentAction("c-1");
    expect(result).toEqual({ success: true, data: undefined });
    expect(h.deleteCommentMock).toHaveBeenCalledWith("c-1", USER, true);
  });

  it("404s a missing comment", async () => {
    h.getCommentOwnerMock.mockResolvedValue(null);
    const result = await deleteDocumentCommentAction("missing");
    expect(result).toEqual({ success: false, error: "Comment not found" });
  });

  it("is unauthorized without a session", async () => {
    h.getSessionMock.mockResolvedValue(null);
    const result = await deleteDocumentCommentAction("c-1");
    expect(result).toEqual({ success: false, error: "Unauthorized" });
  });
});
