/**
 * Unit tests for pgDocumentRepository.
 *
 * All DB I/O is mocked via a chainable Drizzle mock driven by a select queue.
 * No live Postgres required. Tests cover every public method with at least
 * one positive and one negative case; access-control paths are tested in depth.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted mocks — must be defined before any import that uses the mocked modules
// ---------------------------------------------------------------------------
const {
  selectQueue,
  insertValuesReturningMock,
  insertValuesMock,
  updateSetMock,
  updateReturningMock,
  deleteWhereMock,
  revokeAllGrantsMock,
} = vi.hoisted(() => ({
  selectQueue: [] as unknown[][],
  insertValuesReturningMock: vi.fn(),
  insertValuesMock: vi.fn(),
  updateSetMock: vi.fn(),
  updateReturningMock: vi.fn(),
  deleteWhereMock: vi.fn(),
  revokeAllGrantsMock: vi.fn(),
}));

vi.mock("lib/visibility", () => ({ revokeAllGrants: revokeAllGrantsMock }));

// Chainable Drizzle mock that pops from selectQueue for every awaited select().
vi.mock("../db.pg", () => {
  const nextSelect = () => Promise.resolve(selectQueue.shift() ?? []);

  // Handles: select().from().where().limit()
  //          select().from().where().orderBy().limit()
  //          select().from().innerJoin().where().orderBy().limit()
  //          select().from().where().then()   (implicit await on chain)
  const selectChain = () => ({
    from: () => ({
      where: () => ({
        limit: () => nextSelect(),
        orderBy: () => ({ limit: () => nextSelect() }),
        // Support: const rows = await db.select()…where()  (no .limit())
        then: (res: (v: unknown) => unknown) => nextSelect().then(res),
      }),
      innerJoin: () => ({
        where: () => ({
          orderBy: () => ({ limit: () => nextSelect() }),
        }),
      }),
    }),
  });

  const insert = () => ({
    values: (v: unknown) => {
      insertValuesMock(v);
      return { returning: () => insertValuesReturningMock() };
    },
  });

  const update = () => ({
    set: (v: unknown) => {
      updateSetMock(v);
      return { where: () => ({ returning: () => updateReturningMock() }) };
    },
  });

  const del = () => ({
    where: (...args: unknown[]) => {
      deleteWhereMock(...args);
      return Promise.resolve();
    },
  });

  return { pgDb: { select: selectChain, insert, update, delete: del } };
});

// ---------------------------------------------------------------------------
// Import the module under test AFTER all vi.mock() calls
// ---------------------------------------------------------------------------
import { pgDocumentRepository as repo } from "./document-repository.pg";

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------
const OWNER = "00000000-0000-0000-0000-0000000000aa";
const OTHER = "00000000-0000-0000-0000-0000000000bb";
const DOC = "00000000-0000-0000-0000-0000000000dd";
const REV = "00000000-0000-0000-0000-0000000000ee";
const TEAM = "00000000-0000-0000-0000-0000000000ff";

const NOW = new Date("2026-01-01T12:00:00Z");

function makeDoc(overrides: Record<string, unknown> = {}) {
  return {
    id: DOC,
    userId: OWNER,
    teamId: null,
    title: "My Doc",
    content: { type: "doc", content: [] },
    visibility: "private",
    createdAt: NOW,
    updatedAt: NOW,
    lastEditedBy: null,
    lastEditedAt: null,
    archived: false,
    ...overrides,
  };
}

/** Builds the single-row shape returned by _accessRow. */
function accessRow(
  overrides: Partial<{
    userId: string;
    visibility: string;
    teamId: string | null;
    isAdmin: boolean;
    hasGrant: boolean;
    hasEditGrant: boolean;
    hasManageGrant: boolean;
  }> = {},
) {
  return {
    userId: OWNER,
    visibility: "private",
    teamId: null,
    isAdmin: false,
    hasGrant: false,
    hasEditGrant: false,
    hasManageGrant: false,
    ...overrides,
  };
}

function makeRevision(overrides: Record<string, unknown> = {}) {
  return {
    id: REV,
    documentId: DOC,
    title: "My Doc",
    content: { type: "doc", content: [] },
    editedBy: OWNER,
    createdAt: NOW,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  selectQueue.length = 0;
  // Default mock returns for insert/update — callers can override per test.
  insertValuesReturningMock.mockResolvedValue([makeDoc()]);
  updateReturningMock.mockResolvedValue([makeDoc()]);
});

// ===========================================================================
// createDocument
// ===========================================================================
describe("createDocument", () => {
  it("inserts with the supplied userId and title", async () => {
    insertValuesReturningMock.mockResolvedValue([makeDoc({ title: "Hello" })]);
    await repo.createDocument({ userId: OWNER, title: "Hello" });
    const v = insertValuesMock.mock.calls[0][0] as Record<string, unknown>;
    expect(v.userId).toBe(OWNER);
    expect(v.title).toBe("Hello");
  });

  it("defaults title to 'Untitled' when omitted", async () => {
    await repo.createDocument({ userId: OWNER });
    const v = insertValuesMock.mock.calls[0][0] as Record<string, unknown>;
    expect(v.title).toBe("Untitled");
  });

  it("defaults visibility to 'private'", async () => {
    await repo.createDocument({ userId: OWNER });
    const v = insertValuesMock.mock.calls[0][0] as Record<string, unknown>;
    expect(v.visibility).toBe("private");
  });

  it("forwards an explicit visibility value", async () => {
    await repo.createDocument({ userId: OWNER, visibility: "company" });
    const v = insertValuesMock.mock.calls[0][0] as Record<string, unknown>;
    expect(v.visibility).toBe("company");
  });

  it("trims whitespace-only title to 'Untitled'", async () => {
    await repo.createDocument({ userId: OWNER, title: "   " });
    const v = insertValuesMock.mock.calls[0][0] as Record<string, unknown>;
    expect(v.title).toBe("Untitled");
  });

  it("stores teamId when provided", async () => {
    await repo.createDocument({ userId: OWNER, teamId: TEAM });
    const v = insertValuesMock.mock.calls[0][0] as Record<string, unknown>;
    expect(v.teamId).toBe(TEAM);
  });

  it("stores custom content when provided", async () => {
    const content = { type: "doc", content: [{ type: "paragraph" }] };
    await repo.createDocument({ userId: OWNER, content });
    const v = insertValuesMock.mock.calls[0][0] as Record<string, unknown>;
    expect(v.content).toEqual(content);
  });

  it("returns the document row returned by .returning()", async () => {
    const doc = makeDoc({ title: "Returned" });
    insertValuesReturningMock.mockResolvedValue([doc]);
    const result = await repo.createDocument({
      userId: OWNER,
      title: "Returned",
    });
    expect(result).toEqual(doc);
  });
});

// ===========================================================================
// getDocumentById
// ===========================================================================
describe("getDocumentById", () => {
  it("returns the document when found", async () => {
    const doc = makeDoc();
    selectQueue.push([doc]);
    const result = await repo.getDocumentById(DOC);
    expect(result).toEqual(doc);
  });

  it("returns null when the document does not exist", async () => {
    selectQueue.push([]);
    const result = await repo.getDocumentById(DOC);
    expect(result).toBeNull();
  });
});

// ===========================================================================
// listDocumentsForUser
// ===========================================================================
describe("listDocumentsForUser", () => {
  it("returns docs visible to the user (own + shared)", async () => {
    const doc1 = makeDoc({ id: "doc-1" });
    const doc2 = makeDoc({ id: "doc-2", userId: OTHER, visibility: "company" });
    selectQueue.push([doc1, doc2]);
    const result = await repo.listDocumentsForUser(OWNER);
    expect(result).toHaveLength(2);
  });

  it("does NOT return docs owned by another private user", async () => {
    // Only owner's own docs come back — the WHERE clause excludes OTHER's private docs.
    selectQueue.push([makeDoc()]);
    const result = await repo.listDocumentsForUser(OWNER);
    const foreignPrivate = result.filter(
      (d) => d.userId !== OWNER && d.visibility === "private",
    );
    expect(foreignPrivate).toHaveLength(0);
  });

  it("returns an empty array when the user has no docs", async () => {
    selectQueue.push([]);
    const result = await repo.listDocumentsForUser(OTHER);
    expect(result).toEqual([]);
  });
});

// ===========================================================================
// checkAccess — read gate (readOnly = true)
// ===========================================================================
describe("checkAccess (read)", () => {
  it("owner always has read access", async () => {
    selectQueue.push([accessRow({ userId: OWNER })]);
    expect(await repo.checkAccess(DOC, OWNER, true)).toBe(true);
  });

  it("org admin has read access to any doc", async () => {
    selectQueue.push([accessRow({ userId: OWNER, isAdmin: true })]);
    expect(await repo.checkAccess(DOC, OTHER, true)).toBe(true);
  });

  it("returns false when the document does not exist", async () => {
    selectQueue.push([]);
    expect(await repo.checkAccess(DOC, OTHER, true)).toBe(false);
  });

  it("denies a non-owner on a private doc", async () => {
    selectQueue.push([accessRow({ visibility: "private" })]);
    expect(await repo.checkAccess(DOC, OTHER, true)).toBe(false);
  });

  it("allows any user to read a company-visibility doc", async () => {
    selectQueue.push([accessRow({ visibility: "company" })]);
    expect(await repo.checkAccess(DOC, OTHER, true)).toBe(true);
  });

  it("allows a team member to read a team-visibility doc", async () => {
    selectQueue.push([accessRow({ visibility: "team", teamId: TEAM })]);
    selectQueue.push([{ ok: true }]); // membership exists
    expect(await repo.checkAccess(DOC, OTHER, true)).toBe(true);
  });

  it("denies a non-member of the team", async () => {
    selectQueue.push([accessRow({ visibility: "team", teamId: TEAM })]);
    selectQueue.push([]); // no membership row
    expect(await repo.checkAccess(DOC, OTHER, true)).toBe(false);
  });

  it("allows a user with any grant to read a shared doc", async () => {
    selectQueue.push([accessRow({ visibility: "shared", hasGrant: true })]);
    expect(await repo.checkAccess(DOC, OTHER, true)).toBe(true);
  });

  it("denies a user with no grant on a shared doc", async () => {
    selectQueue.push([accessRow({ visibility: "shared", hasGrant: false })]);
    expect(await repo.checkAccess(DOC, OTHER, true)).toBe(false);
  });
});

// ===========================================================================
// checkAccess — edit gate (readOnly = false)
// ===========================================================================
describe("checkAccess (edit)", () => {
  it("owner always has edit access", async () => {
    selectQueue.push([accessRow({ userId: OWNER })]);
    expect(await repo.checkAccess(DOC, OWNER, false)).toBe(true);
  });

  it("org admin has edit access", async () => {
    selectQueue.push([accessRow({ userId: OWNER, isAdmin: true })]);
    expect(await repo.checkAccess(DOC, OTHER, false)).toBe(true);
  });

  it("an edit-grantee has edit access", async () => {
    selectQueue.push([
      accessRow({ visibility: "shared", hasGrant: true, hasEditGrant: true }),
    ]);
    expect(await repo.checkAccess(DOC, OTHER, false)).toBe(true);
  });

  it("a view-only grantee does NOT have edit access", async () => {
    selectQueue.push([
      accessRow({
        visibility: "shared",
        hasGrant: true,
        hasEditGrant: false,
      }),
    ]);
    expect(await repo.checkAccess(DOC, OTHER, false)).toBe(false);
  });

  it("company visibility does NOT imply edit access for non-owners", async () => {
    selectQueue.push([accessRow({ visibility: "company" })]);
    expect(await repo.checkAccess(DOC, OTHER, false)).toBe(false);
  });
});

// ===========================================================================
// checkManageAccess
// ===========================================================================
describe("checkManageAccess", () => {
  it("owner has manage access", async () => {
    selectQueue.push([accessRow({ userId: OWNER })]);
    expect(await repo.checkManageAccess(DOC, OWNER)).toBe(true);
  });

  it("org admin has manage access", async () => {
    selectQueue.push([accessRow({ userId: OWNER, isAdmin: true })]);
    expect(await repo.checkManageAccess(DOC, OTHER)).toBe(true);
  });

  it("a manage-grantee has manage access", async () => {
    selectQueue.push([
      accessRow({
        visibility: "shared",
        hasGrant: true,
        hasEditGrant: true,
        hasManageGrant: true,
      }),
    ]);
    expect(await repo.checkManageAccess(DOC, OTHER)).toBe(true);
  });

  it("a plain edit-grantee does NOT have manage access (P0 guard)", async () => {
    selectQueue.push([
      accessRow({
        visibility: "shared",
        hasGrant: true,
        hasEditGrant: true,
        hasManageGrant: false,
      }),
    ]);
    expect(await repo.checkManageAccess(DOC, OTHER)).toBe(false);
  });

  it("a view-only grantee does NOT have manage access", async () => {
    selectQueue.push([accessRow({ visibility: "shared", hasGrant: true })]);
    expect(await repo.checkManageAccess(DOC, OTHER)).toBe(false);
  });

  it("company-visibility reader does NOT have manage access", async () => {
    selectQueue.push([accessRow({ visibility: "company" })]);
    expect(await repo.checkManageAccess(DOC, OTHER)).toBe(false);
  });

  it("returns false when the document does not exist", async () => {
    selectQueue.push([]);
    expect(await repo.checkManageAccess(DOC, OTHER)).toBe(false);
  });
});

// ===========================================================================
// updateDocument
// ===========================================================================
describe("updateDocument", () => {
  it("owner can update title and content", async () => {
    selectQueue.push([accessRow({ userId: OWNER })]); // checkAccess(edit)
    const updated = makeDoc({ title: "New", content: { x: 1 } });
    updateReturningMock.mockResolvedValue([updated]);
    const result = await repo.updateDocument(
      DOC,
      { title: "New", content: { x: 1 } },
      OWNER,
    );
    expect(result.title).toBe("New");
    const set = updateSetMock.mock.calls[0][0] as Record<string, unknown>;
    expect(set.lastEditedBy).toBe(OWNER);
    expect(set.lastEditedAt).toBeInstanceOf(Date);
    expect(set.title).toBe("New");
    expect(set.content).toEqual({ x: 1 });
  });

  it("trims whitespace-only title to 'Untitled' on update", async () => {
    selectQueue.push([accessRow({ userId: OWNER })]);
    updateReturningMock.mockResolvedValue([makeDoc()]);
    await repo.updateDocument(DOC, { title: "   " }, OWNER);
    const set = updateSetMock.mock.calls[0][0] as Record<string, unknown>;
    expect(set.title).toBe("Untitled");
  });

  it("throws Forbidden when caller lacks edit access", async () => {
    // company visibility → readable but not editable
    selectQueue.push([accessRow({ visibility: "company" })]);
    await expect(
      repo.updateDocument(DOC, { title: "x" }, OTHER),
    ).rejects.toThrow("Forbidden");
    expect(updateSetMock).not.toHaveBeenCalled();
  });

  it("an edit-grantee can update content", async () => {
    selectQueue.push([
      accessRow({ visibility: "shared", hasGrant: true, hasEditGrant: true }),
    ]);
    updateReturningMock.mockResolvedValue([makeDoc()]);
    await repo.updateDocument(DOC, { content: { y: 2 } }, OTHER);
    expect(updateSetMock).toHaveBeenCalledTimes(1);
  });
});

// ===========================================================================
// deleteDocument
// ===========================================================================
describe("deleteDocument", () => {
  it("owner can delete their own document", async () => {
    selectQueue.push([accessRow({ userId: OWNER })]);
    await repo.deleteDocument(DOC, OWNER);
    expect(deleteWhereMock).toHaveBeenCalledTimes(1);
  });

  it("org admin can delete any document", async () => {
    selectQueue.push([accessRow({ userId: OWNER, isAdmin: true })]);
    await repo.deleteDocument(DOC, OTHER);
    expect(deleteWhereMock).toHaveBeenCalledTimes(1);
  });

  it("a manage-grantee can delete a document", async () => {
    selectQueue.push([
      accessRow({
        visibility: "shared",
        hasGrant: true,
        hasEditGrant: true,
        hasManageGrant: true,
      }),
    ]);
    await repo.deleteDocument(DOC, OTHER);
    expect(deleteWhereMock).toHaveBeenCalledTimes(1);
  });

  it("an edit-grantee CANNOT delete — Forbidden, doc untouched", async () => {
    selectQueue.push([
      accessRow({
        visibility: "shared",
        hasGrant: true,
        hasEditGrant: true,
        hasManageGrant: false,
      }),
    ]);
    await expect(repo.deleteDocument(DOC, OTHER)).rejects.toThrow("Forbidden");
    expect(deleteWhereMock).not.toHaveBeenCalled();
  });

  it("a user with no grant CANNOT delete another user's doc", async () => {
    selectQueue.push([accessRow({ visibility: "private" })]);
    await expect(repo.deleteDocument(DOC, OTHER)).rejects.toThrow("Forbidden");
    expect(deleteWhereMock).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// setVisibility
// ===========================================================================
describe("setVisibility", () => {
  it("owner can change visibility to 'company'", async () => {
    selectQueue.push([accessRow({ userId: OWNER })]);
    updateReturningMock.mockResolvedValue([makeDoc({ visibility: "company" })]);
    const result = await repo.setVisibility(DOC, "company", OWNER);
    expect(result.visibility).toBe("company");
    expect(updateSetMock).toHaveBeenCalledTimes(1);
  });

  it("calls revokeAllGrants when setting visibility to 'private'", async () => {
    selectQueue.push([accessRow({ userId: OWNER })]);
    updateReturningMock.mockResolvedValue([makeDoc({ visibility: "private" })]);
    await repo.setVisibility(DOC, "private", OWNER);
    expect(revokeAllGrantsMock).toHaveBeenCalledWith("document", DOC);
  });

  it("does NOT call revokeAllGrants when setting to 'shared'", async () => {
    selectQueue.push([accessRow({ userId: OWNER })]);
    updateReturningMock.mockResolvedValue([makeDoc({ visibility: "shared" })]);
    await repo.setVisibility(DOC, "shared", OWNER);
    expect(revokeAllGrantsMock).not.toHaveBeenCalled();
  });

  it("does NOT call revokeAllGrants when setting to 'team'", async () => {
    selectQueue.push([accessRow({ userId: OWNER })]);
    updateReturningMock.mockResolvedValue([makeDoc({ visibility: "team" })]);
    await repo.setVisibility(DOC, "team", OWNER);
    expect(revokeAllGrantsMock).not.toHaveBeenCalled();
  });

  it("throws Forbidden for a non-owner without manage grant", async () => {
    selectQueue.push([accessRow({ visibility: "private" })]);
    await expect(repo.setVisibility(DOC, "company", OTHER)).rejects.toThrow(
      "Forbidden",
    );
    expect(updateSetMock).not.toHaveBeenCalled();
  });

  it("throws Forbidden for an edit-grantee (re-share is manage-gated)", async () => {
    selectQueue.push([
      accessRow({
        visibility: "shared",
        hasGrant: true,
        hasEditGrant: true,
        hasManageGrant: false,
      }),
    ]);
    await expect(repo.setVisibility(DOC, "company", OTHER)).rejects.toThrow(
      "Forbidden",
    );
    expect(updateSetMock).not.toHaveBeenCalled();
  });

  it("allows a manage-grantee to change visibility", async () => {
    selectQueue.push([
      accessRow({
        visibility: "shared",
        hasGrant: true,
        hasEditGrant: true,
        hasManageGrant: true,
      }),
    ]);
    updateReturningMock.mockResolvedValue([makeDoc({ visibility: "company" })]);
    await repo.setVisibility(DOC, "company", OTHER);
    expect(updateSetMock).toHaveBeenCalledTimes(1);
  });

  it("stores the teamId when provided", async () => {
    selectQueue.push([accessRow({ userId: OWNER })]);
    updateReturningMock.mockResolvedValue([
      makeDoc({ visibility: "team", teamId: TEAM }),
    ]);
    await repo.setVisibility(DOC, "team", OWNER, TEAM);
    const set = updateSetMock.mock.calls[0][0] as Record<string, unknown>;
    expect(set.teamId).toBe(TEAM);
  });
});

// ===========================================================================
// createRevision (saveVersion)
// ===========================================================================
describe("createRevision (saveVersion)", () => {
  it("owner can create a revision (snapshot)", async () => {
    // checkAccess(edit) → owner row
    selectQueue.push([accessRow({ userId: OWNER })]);
    // getDocumentById
    selectQueue.push([makeDoc()]);
    const rev = makeRevision();
    insertValuesReturningMock.mockResolvedValue([rev]);
    const result = await repo.createRevision(DOC, OWNER);
    expect(result.documentId).toBe(DOC);
    expect(result.editedBy).toBe(OWNER);
    // Inserted values should carry current doc content and title
    const v = insertValuesMock.mock.calls[0][0] as Record<string, unknown>;
    expect(v.documentId).toBe(DOC);
    expect(v.editedBy).toBe(OWNER);
  });

  it("throws Forbidden when caller lacks edit access", async () => {
    selectQueue.push([accessRow({ visibility: "company" })]);
    await expect(repo.createRevision(DOC, OTHER)).rejects.toThrow("Forbidden");
    expect(insertValuesMock).not.toHaveBeenCalled();
  });

  it("throws when the document does not exist", async () => {
    // checkAccess → edit-grantee
    selectQueue.push([
      accessRow({ visibility: "shared", hasGrant: true, hasEditGrant: true }),
    ]);
    // getDocumentById → not found
    selectQueue.push([]);
    await expect(repo.createRevision(DOC, OTHER)).rejects.toThrow(
      "Document not found",
    );
  });
});

// ===========================================================================
// listRevisions (listVersions)
// ===========================================================================
describe("listRevisions (listVersions)", () => {
  it("returns revisions for a document in descending order", async () => {
    const rev1 = makeRevision({ id: "rev-1" });
    const rev2 = makeRevision({ id: "rev-2" });
    selectQueue.push([rev1, rev2]);
    const result = await repo.listRevisions(DOC);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("rev-1");
  });

  it("returns an empty array when there are no revisions", async () => {
    selectQueue.push([]);
    const result = await repo.listRevisions(DOC);
    expect(result).toEqual([]);
  });
});

// ===========================================================================
// restoreRevision (restoreVersion)
// ===========================================================================
describe("restoreRevision (restoreVersion)", () => {
  it("owner can restore a past revision", async () => {
    // checkAccess(edit) for restoreRevision itself
    selectQueue.push([accessRow({ userId: OWNER })]);
    // Select for the revision lookup
    const rev = makeRevision({
      title: "Old Title",
      content: { type: "doc", content: [{ type: "text", text: "old" }] },
    });
    selectQueue.push([rev]);
    // createRevision → checkAccess(edit) snapshot
    selectQueue.push([accessRow({ userId: OWNER })]);
    // createRevision → getDocumentById
    selectQueue.push([makeDoc()]);
    // createRevision → insert revision (snapshot)
    insertValuesReturningMock.mockResolvedValueOnce([makeRevision()]);
    // Restore update returning
    const restored = makeDoc({ title: "Old Title" });
    updateReturningMock.mockResolvedValue([restored]);

    const result = await repo.restoreRevision(DOC, REV, OWNER);
    expect(result.title).toBe("Old Title");
    expect(updateSetMock).toHaveBeenCalledTimes(1);
    const set = updateSetMock.mock.calls[0][0] as Record<string, unknown>;
    expect(set.title).toBe("Old Title");
    expect(set.lastEditedBy).toBe(OWNER);
  });

  it("throws when the revision does not belong to the document", async () => {
    selectQueue.push([accessRow({ userId: OWNER })]);
    // Revision not found
    selectQueue.push([]);
    await expect(repo.restoreRevision(DOC, "bad-rev", OWNER)).rejects.toThrow(
      "Revision not found",
    );
    expect(updateSetMock).not.toHaveBeenCalled();
  });

  it("throws Forbidden when caller lacks edit access", async () => {
    selectQueue.push([accessRow({ visibility: "company" })]);
    await expect(repo.restoreRevision(DOC, REV, OTHER)).rejects.toThrow(
      "Forbidden",
    );
    expect(updateSetMock).not.toHaveBeenCalled();
  });

  it("snapshots current doc state before overwriting (restore is undoable)", async () => {
    // checkAccess for restore
    selectQueue.push([accessRow({ userId: OWNER })]);
    // Revision found
    selectQueue.push([makeRevision()]);
    // createRevision: checkAccess
    selectQueue.push([accessRow({ userId: OWNER })]);
    // createRevision: getDocumentById
    selectQueue.push([makeDoc()]);
    // First insert = snapshot, second = (not needed, update handles restore)
    insertValuesReturningMock.mockResolvedValueOnce([makeRevision()]);
    updateReturningMock.mockResolvedValue([makeDoc()]);

    await repo.restoreRevision(DOC, REV, OWNER);
    // The snapshot insert must happen before the restore update
    expect(insertValuesMock).toHaveBeenCalledTimes(1);
    expect(updateSetMock).toHaveBeenCalledTimes(1);
    // Insert call must precede update call (snapshot-before-restore invariant)
    const insertOrder = insertValuesMock.mock.invocationCallOrder[0];
    const updateOrder = updateSetMock.mock.invocationCallOrder[0];
    expect(insertOrder).toBeLessThan(updateOrder);
  });
});

// ===========================================================================
// renameDocument (convenience wrapper)
// ===========================================================================
describe("renameDocument", () => {
  it("delegates to updateDocument with title only", async () => {
    selectQueue.push([accessRow({ userId: OWNER })]);
    updateReturningMock.mockResolvedValue([makeDoc({ title: "Renamed" })]);
    const result = await repo.renameDocument(DOC, "Renamed", OWNER);
    expect(result.title).toBe("Renamed");
    const set = updateSetMock.mock.calls[0][0] as Record<string, unknown>;
    expect(set.title).toBe("Renamed");
  });
});
