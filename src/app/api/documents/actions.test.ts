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
      // content crosses the boundary as a JSON STRING (see updateDocumentAction);
      // the action parses it and forwards the object to the repo. This also
      // guards the attrs-corruption fix: a heading level must survive.
      const content = {
        type: "doc",
        content: [{ type: "heading", attrs: { level: 2 } }],
      };
      const res = await updateDocumentAction(DOC, {
        title: "T",
        content: JSON.stringify(content),
      });
      expect(res.success).toBe(true);
      expect(repo.updateDocument).toHaveBeenCalledWith(
        DOC,
        { title: "T", content },
        USER,
      );
    });

    it("rejects malformed JSON content", async () => {
      const { updateDocumentAction } = await import("./actions");
      const res = await updateDocumentAction(DOC, { content: "{not json" });
      expect(res).toEqual({
        success: false,
        error: "Invalid document content",
      });
      expect(repo.updateDocument).not.toHaveBeenCalled();
    });

    it("surfaces a repo Forbidden as a structured ActionResult", async () => {
      repo.updateDocument.mockRejectedValue(new Error("Forbidden"));
      const { updateDocumentAction } = await import("./actions");
      const res = await updateDocumentAction(DOC, { title: "T" });
      expect(res).toEqual({ success: false, error: "Forbidden" });
    });

    it("rejects an absurdly large content payload before writing", async () => {
      const { updateDocumentAction } = await import("./actions");
      const huge = JSON.stringify({ type: "doc", blob: "x".repeat(4_000_001) });
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

// ── Additional coverage ──────────────────────────────────────────────────────

const REV = "00000000-0000-0000-0000-00000000rrrr";

describe("deleteDocumentAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSessionMock.mockResolvedValue({ user: { id: USER } });
  });

  it("unauthenticated → { success: false, error: 'Unauthorized' }", async () => {
    getSessionMock.mockResolvedValue(null);
    const { deleteDocumentAction } = await import("./actions");
    const res = await deleteDocumentAction(DOC);
    expect(res).toEqual({ success: false, error: "Unauthorized" });
    expect(repo.deleteDocument).not.toHaveBeenCalled();
  });

  it("authenticated, repo.deleteDocument succeeds → { success: true }", async () => {
    repo.deleteDocument.mockResolvedValue(undefined);
    const { deleteDocumentAction } = await import("./actions");
    const res = await deleteDocumentAction(DOC);
    expect(res).toEqual({ success: true });
    expect(repo.deleteDocument).toHaveBeenCalledWith(DOC, USER);
  });

  it("authenticated, repo throws 'Forbidden' → { success: false, error: 'Forbidden' }", async () => {
    repo.deleteDocument.mockRejectedValue(new Error("Forbidden"));
    const { deleteDocumentAction } = await import("./actions");
    const res = await deleteDocumentAction(DOC);
    expect(res).toEqual({ success: false, error: "Forbidden" });
  });
});

describe("setDocumentVisibilityAction (additional)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSessionMock.mockResolvedValue({ user: { id: USER } });
  });

  it("unauthenticated → { success: false }", async () => {
    getSessionMock.mockResolvedValue(null);
    const { setDocumentVisibilityAction } = await import("./actions");
    const res = await setDocumentVisibilityAction(DOC, "private");
    expect(res.success).toBe(false);
    expect(repo.setVisibility).not.toHaveBeenCalled();
  });

  it("valid visibility 'private' → calls repo.setVisibility with correct args", async () => {
    repo.setVisibility.mockResolvedValue({ id: DOC, visibility: "private" });
    const { setDocumentVisibilityAction } = await import("./actions");
    const res = await setDocumentVisibilityAction(DOC, "private");
    expect(res.success).toBe(true);
    expect(repo.setVisibility).toHaveBeenCalledWith(
      DOC,
      "private",
      USER,
      undefined,
    );
  });

  it("valid visibility 'team' with teamId → calls repo.setVisibility with teamId", async () => {
    repo.setVisibility.mockResolvedValue({ id: DOC, visibility: "team" });
    const { setDocumentVisibilityAction } = await import("./actions");
    const res = await setDocumentVisibilityAction(DOC, "team", "team-42");
    expect(res.success).toBe(true);
    expect(repo.setVisibility).toHaveBeenCalledWith(
      DOC,
      "team",
      USER,
      "team-42",
    );
  });

  it("valid visibility 'shared' → calls repo.setVisibility", async () => {
    repo.setVisibility.mockResolvedValue({ id: DOC, visibility: "shared" });
    const { setDocumentVisibilityAction } = await import("./actions");
    const res = await setDocumentVisibilityAction(DOC, "shared");
    expect(res.success).toBe(true);
    expect(repo.setVisibility).toHaveBeenCalledWith(
      DOC,
      "shared",
      USER,
      undefined,
    );
  });
});

describe("saveDocumentVersionAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSessionMock.mockResolvedValue({ user: { id: USER } });
  });

  it("unauthenticated → { success: false }", async () => {
    getSessionMock.mockResolvedValue(null);
    const { saveDocumentVersionAction } = await import("./actions");
    const res = await saveDocumentVersionAction(DOC);
    expect(res.success).toBe(false);
    expect(repo.createRevision).not.toHaveBeenCalled();
  });

  it("saves a version snapshot for the caller's document", async () => {
    const revision = {
      id: REV,
      documentId: DOC,
      userId: USER,
      createdAt: new Date(),
    };
    repo.createRevision.mockResolvedValue(revision);
    const { saveDocumentVersionAction } = await import("./actions");
    const res = await saveDocumentVersionAction(DOC);
    expect(res).toEqual({ success: true, data: revision });
    expect(repo.createRevision).toHaveBeenCalledWith(DOC, USER);
  });

  it("repo throws Forbidden → { success: false, error: 'Forbidden' }", async () => {
    repo.createRevision.mockRejectedValue(new Error("Forbidden"));
    const { saveDocumentVersionAction } = await import("./actions");
    const res = await saveDocumentVersionAction(DOC);
    expect(res).toEqual({ success: false, error: "Forbidden" });
  });
});

describe("restoreDocumentVersionAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSessionMock.mockResolvedValue({ user: { id: USER } });
  });

  it("unauthenticated → { success: false }", async () => {
    getSessionMock.mockResolvedValue(null);
    const { restoreDocumentVersionAction } = await import("./actions");
    const res = await restoreDocumentVersionAction(DOC, REV);
    expect(res.success).toBe(false);
    expect(repo.restoreRevision).not.toHaveBeenCalled();
  });

  it("restores document to the given revision", async () => {
    const restored = { id: DOC, title: "Restored title", userId: USER };
    repo.restoreRevision.mockResolvedValue(restored);
    const { restoreDocumentVersionAction } = await import("./actions");
    const res = await restoreDocumentVersionAction(DOC, REV);
    expect(res).toEqual({ success: true, data: restored });
    expect(repo.restoreRevision).toHaveBeenCalledWith(DOC, REV, USER);
  });

  it("repo throws 'Forbidden' → structured error", async () => {
    repo.restoreRevision.mockRejectedValue(new Error("Forbidden"));
    const { restoreDocumentVersionAction } = await import("./actions");
    const res = await restoreDocumentVersionAction(DOC, REV);
    expect(res).toEqual({ success: false, error: "Forbidden" });
  });
});

describe("listDocumentsAction (additional)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSessionMock.mockResolvedValue({ user: { id: USER } });
  });

  it("unauthenticated → { success: false }", async () => {
    getSessionMock.mockResolvedValue(null);
    const { listDocumentsAction } = await import("./actions");
    const res = await listDocumentsAction();
    expect(res.success).toBe(false);
    expect(repo.listDocumentsForUser).not.toHaveBeenCalled();
  });

  it("returns an empty list when the user has no documents", async () => {
    repo.listDocumentsForUser.mockResolvedValue([]);
    const { listDocumentsAction } = await import("./actions");
    const res = await listDocumentsAction();
    expect(res).toEqual({ success: true, data: [] });
    expect(repo.listDocumentsForUser).toHaveBeenCalledWith(USER);
  });

  it("returns multiple documents scoped to the caller", async () => {
    const docs = [
      { id: DOC, title: "Doc A" },
      { id: "00000000-0000-0000-0000-00000000eeee", title: "Doc B" },
    ];
    repo.listDocumentsForUser.mockResolvedValue(docs);
    const { listDocumentsAction } = await import("./actions");
    const res = await listDocumentsAction();
    expect(res).toEqual({ success: true, data: docs });
  });
});

describe("getDocumentAction (additional)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSessionMock.mockResolvedValue({ user: { id: USER } });
  });

  it("unauthenticated → { success: false }", async () => {
    getSessionMock.mockResolvedValue(null);
    const { getDocumentAction } = await import("./actions");
    const res = await getDocumentAction(DOC);
    expect(res.success).toBe(false);
    expect(repo.checkAccess).not.toHaveBeenCalled();
    expect(repo.getDocumentById).not.toHaveBeenCalled();
  });

  it("access denied → { success: false, error: 'Forbidden' }", async () => {
    repo.checkAccess.mockResolvedValue(false);
    const { getDocumentAction } = await import("./actions");
    const res = await getDocumentAction(DOC);
    expect(res).toEqual({ success: false, error: "Forbidden" });
    expect(repo.getDocumentById).not.toHaveBeenCalled();
  });

  it("access granted but document not found → { success: false }", async () => {
    repo.checkAccess.mockResolvedValue(true);
    repo.getDocumentById.mockResolvedValue(null);
    const { getDocumentAction } = await import("./actions");
    const res = await getDocumentAction(DOC);
    expect(res.success).toBe(false);
  });

  it("access granted → returns document", async () => {
    const doc = { id: DOC, title: "My Doc", userId: USER };
    repo.checkAccess.mockResolvedValue(true);
    repo.getDocumentById.mockResolvedValue(doc);
    const { getDocumentAction } = await import("./actions");
    const res = await getDocumentAction(DOC);
    expect(res).toEqual({ success: true, data: doc });
    expect(repo.checkAccess).toHaveBeenCalledWith(DOC, USER, true);
    expect(repo.getDocumentById).toHaveBeenCalledWith(DOC);
  });
});

describe("updateDocumentAction (additional)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSessionMock.mockResolvedValue({ user: { id: USER } });
  });

  it("unauthenticated → { success: false, error: 'Unauthorized' }", async () => {
    getSessionMock.mockResolvedValue(null);
    const { updateDocumentAction } = await import("./actions");
    const res = await updateDocumentAction(DOC, { title: "New title" });
    expect(res).toEqual({ success: false, error: "Unauthorized" });
    expect(repo.updateDocument).not.toHaveBeenCalled();
  });

  it("content > 4 MB → { success: false, error: 'Document is too large to save' }", async () => {
    const { updateDocumentAction } = await import("./actions");
    const huge = JSON.stringify({ type: "doc", blob: "x".repeat(4_000_001) });
    const res = await updateDocumentAction(DOC, { content: huge });
    expect(res).toEqual({
      success: false,
      error: "Document is too large to save",
    });
    expect(repo.updateDocument).not.toHaveBeenCalled();
  });

  it("valid title-only update → { success: true }", async () => {
    repo.updateDocument.mockResolvedValue({ id: DOC, title: "Renamed" });
    const { updateDocumentAction } = await import("./actions");
    const res = await updateDocumentAction(DOC, { title: "Renamed" });
    expect(res).toEqual({ success: true, data: { id: DOC, title: "Renamed" } });
    expect(repo.updateDocument).toHaveBeenCalledWith(
      DOC,
      { title: "Renamed", content: undefined },
      USER,
    );
  });

  it("valid content update → { success: true } and parses JSON", async () => {
    const content = { type: "doc", content: [{ type: "paragraph" }] };
    repo.updateDocument.mockResolvedValue({ id: DOC });
    const { updateDocumentAction } = await import("./actions");
    const res = await updateDocumentAction(DOC, {
      content: JSON.stringify(content),
    });
    expect(res.success).toBe(true);
    expect(repo.updateDocument).toHaveBeenCalledWith(
      DOC,
      { title: undefined, content },
      USER,
    );
  });
});
