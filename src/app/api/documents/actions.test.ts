import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSessionMock, repo } = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  repo: {
    createDocument: vi.fn(),
    getDocumentById: vi.fn(),
    checkAccess: vi.fn(),
    listDocumentsForUser: vi.fn(),
    updateDocument: vi.fn(),
    renameDocument: vi.fn(),
    setVisibility: vi.fn(),
    deleteDocument: vi.fn(),
    createRevision: vi.fn(),
    listRevisions: vi.fn(),
    restoreRevision: vi.fn(),
  },
}));

vi.mock("auth/server", () => ({ getSession: getSessionMock }));
vi.mock("lib/db/repository", () => ({ documentRepository: repo }));

const USER = "00000000-0000-0000-0000-00000000aaaa";
const DOC = "00000000-0000-0000-0000-00000000dddd";

describe("document server actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSessionMock.mockResolvedValue({ user: { id: USER } });
  });

  describe("unauthenticated", () => {
    beforeEach(() => getSessionMock.mockResolvedValue(null));

    it("createDocumentAction → structured Unauthorized", async () => {
      const { createDocumentAction } = await import("./actions");
      await expect(createDocumentAction()).resolves.toEqual({
        success: false,
        error: "Unauthorized",
      });
      expect(repo.createDocument).not.toHaveBeenCalled();
    });

    it("updateDocumentAction → structured Unauthorized", async () => {
      const { updateDocumentAction } = await import("./actions");
      await expect(updateDocumentAction(DOC, { title: "x" })).resolves.toEqual({
        success: false,
        error: "Unauthorized",
      });
      expect(repo.updateDocument).not.toHaveBeenCalled();
    });
  });

  describe("createDocumentAction", () => {
    it("creates owned by the caller and returns the row", async () => {
      repo.createDocument.mockResolvedValue({ id: DOC, userId: USER });
      const { createDocumentAction } = await import("./actions");
      const res = await createDocumentAction({ title: "Spec" });
      expect(res).toEqual({ success: true, data: { id: DOC, userId: USER } });
      expect(repo.createDocument).toHaveBeenCalledWith(
        expect.objectContaining({ userId: USER, title: "Spec" }),
      );
    });
  });

  describe("updateDocumentAction (autosave)", () => {
    it("forwards title+content to the repository", async () => {
      repo.updateDocument.mockResolvedValue({ id: DOC });
      const { updateDocumentAction } = await import("./actions");
      const content = { type: "doc", content: [] };
      const res = await updateDocumentAction(DOC, { title: "T", content });
      expect(res.success).toBe(true);
      expect(repo.updateDocument).toHaveBeenCalledWith(
        DOC,
        { title: "T", content },
        USER,
      );
    });

    it("surfaces a repo Forbidden as a structured ActionResult", async () => {
      repo.updateDocument.mockRejectedValue(new Error("Forbidden"));
      const { updateDocumentAction } = await import("./actions");
      const res = await updateDocumentAction(DOC, { title: "T" });
      expect(res).toEqual({ success: false, error: "Forbidden" });
    });

    it("rejects an absurdly large content payload before writing", async () => {
      const { updateDocumentAction } = await import("./actions");
      const huge = { type: "doc", blob: "x".repeat(4_000_001) };
      const res = await updateDocumentAction(DOC, { content: huge });
      expect(res).toEqual({
        success: false,
        error: "Document is too large to save",
      });
      expect(repo.updateDocument).not.toHaveBeenCalled();
    });
  });

  describe("setDocumentVisibilityAction", () => {
    it("forwards visibility + teamId to the repository", async () => {
      repo.setVisibility.mockResolvedValue({ id: DOC, visibility: "team" });
      const { setDocumentVisibilityAction } = await import("./actions");
      const res = await setDocumentVisibilityAction(DOC, "team", "team-1");
      expect(res.success).toBe(true);
      expect(repo.setVisibility).toHaveBeenCalledWith(
        DOC,
        "team",
        USER,
        "team-1",
      );
    });

    it("surfaces a repo Forbidden as a structured ActionResult", async () => {
      repo.setVisibility.mockRejectedValue(new Error("Forbidden"));
      const { setDocumentVisibilityAction } = await import("./actions");
      const res = await setDocumentVisibilityAction(DOC, "company");
      expect(res).toEqual({ success: false, error: "Forbidden" });
    });
  });

  describe("getDocumentAction", () => {
    it("denies a caller without read access", async () => {
      repo.checkAccess.mockResolvedValue(false);
      const { getDocumentAction } = await import("./actions");
      const res = await getDocumentAction(DOC);
      expect(res).toEqual({ success: false, error: "Forbidden" });
      expect(repo.getDocumentById).not.toHaveBeenCalled();
    });

    it("returns the document when the caller has read access", async () => {
      repo.checkAccess.mockResolvedValue(true);
      repo.getDocumentById.mockResolvedValue({ id: DOC, title: "T" });
      const { getDocumentAction } = await import("./actions");
      const res = await getDocumentAction(DOC);
      expect(res).toEqual({ success: true, data: { id: DOC, title: "T" } });
      expect(repo.checkAccess).toHaveBeenCalledWith(DOC, USER, true);
    });
  });

  describe("listDocumentsAction", () => {
    it("scopes to the caller", async () => {
      repo.listDocumentsForUser.mockResolvedValue([{ id: DOC }]);
      const { listDocumentsAction } = await import("./actions");
      const res = await listDocumentsAction();
      expect(res).toEqual({ success: true, data: [{ id: DOC }] });
      expect(repo.listDocumentsForUser).toHaveBeenCalledWith(USER);
    });
  });
});
