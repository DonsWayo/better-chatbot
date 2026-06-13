import { beforeEach, describe, expect, it, vi } from "vitest";

// These tests assert the structured-result conversion: the exported actions
// now RETURN { success:false, error } for auth/validation failures (so prod
// Next.js doesn't mask the message into an opaque 500) and { success:true,
// data } on success, instead of throwing.

const {
  getSessionMock,
  canAccessMock,
  ingestDocumentMock,
  insertReturningMock,
  updateReturningMock,
  deleteReturningMock,
  selectWhereMock,
} = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  canAccessMock: vi.fn(),
  ingestDocumentMock: vi.fn(),
  insertReturningMock: vi.fn(),
  updateReturningMock: vi.fn(),
  deleteReturningMock: vi.fn(),
  selectWhereMock: vi.fn(),
}));

vi.mock("lib/auth/server", () => ({ getSession: getSessionMock }));
vi.mock("lib/visibility", () => ({ canAccess: canAccessMock }));
vi.mock("lib/ai/embeddings/ingest", () => ({
  ingestDocument: ingestDocumentMock,
}));
vi.mock("lib/knowledge/collections", () => ({
  WRITABLE_VISIBILITIES: new Set(["private", "team", "company"]),
  normalizeWriteVisibility: (v: string) => v,
  resolveTeamIds: (input: { teamIds?: string[] | null }) =>
    input.teamIds ?? null,
}));

// Minimal drizzle query-builder stub. Each terminal method resolves from a
// hoisted mock so individual tests can shape the result.
vi.mock("lib/db/pg/db.pg", () => {
  const select = () => ({
    from: () => ({ where: (...a: unknown[]) => selectWhereMock(...a) }),
  });
  const insert = () => ({
    values: () => ({ returning: () => insertReturningMock() }),
  });
  const update = () => ({
    set: () => ({ where: () => ({ returning: () => updateReturningMock() }) }),
  });
  const del = () => ({
    where: () => ({ returning: () => deleteReturningMock() }),
  });
  return { pgDb: { select, insert, update, delete: del } };
});

const ADMIN = { user: { id: "admin-1", role: "admin" } };
const PLAIN = { user: { id: "user-1", role: "user" } };
const COLLECTION = { id: "col-1", name: "Docs", visibility: "company" };

beforeEach(() => {
  vi.clearAllMocks();
  selectWhereMock.mockResolvedValue([COLLECTION]);
  insertReturningMock.mockResolvedValue([COLLECTION]);
  updateReturningMock.mockResolvedValue([{ ...COLLECTION, name: "Renamed" }]);
  deleteReturningMock.mockResolvedValue([{ id: "chunk-1" }]);
  ingestDocumentMock.mockResolvedValue(3);
});

describe("createKnowledgeCollectionAction", () => {
  it("returns a structured Unauthorized failure when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { createKnowledgeCollectionAction } = await import("./actions");
    await expect(
      createKnowledgeCollectionAction({ name: "X" }),
    ).resolves.toEqual({ success: false, error: "Unauthorized" });
    expect(insertReturningMock).not.toHaveBeenCalled();
  });

  it("returns a structured Admin required failure for non-admins", async () => {
    getSessionMock.mockResolvedValue(PLAIN);
    const { createKnowledgeCollectionAction } = await import("./actions");
    await expect(
      createKnowledgeCollectionAction({ name: "X" }),
    ).resolves.toEqual({ success: false, error: "Admin required" });
    expect(insertReturningMock).not.toHaveBeenCalled();
  });

  it("returns 'Name is required' for a blank name", async () => {
    getSessionMock.mockResolvedValue(ADMIN);
    const { createKnowledgeCollectionAction } = await import("./actions");
    await expect(
      createKnowledgeCollectionAction({ name: "   " }),
    ).resolves.toEqual({ success: false, error: "Name is required" });
    expect(insertReturningMock).not.toHaveBeenCalled();
  });

  it("returns 'Invalid visibility' for an unwritable visibility", async () => {
    getSessionMock.mockResolvedValue(ADMIN);
    const { createKnowledgeCollectionAction } = await import("./actions");
    await expect(
      createKnowledgeCollectionAction({ name: "Docs", visibility: "secret" }),
    ).resolves.toEqual({ success: false, error: "Invalid visibility" });
  });

  it("returns the created row on success", async () => {
    getSessionMock.mockResolvedValue(ADMIN);
    const { createKnowledgeCollectionAction } = await import("./actions");
    await expect(
      createKnowledgeCollectionAction({ name: "Docs" }),
    ).resolves.toEqual({ success: true, data: COLLECTION });
    expect(insertReturningMock).toHaveBeenCalled();
  });
});

describe("updateKnowledgeCollectionAction", () => {
  it("returns a structured Forbidden failure when the caller lacks manage", async () => {
    getSessionMock.mockResolvedValue(PLAIN);
    canAccessMock.mockResolvedValue(false);
    const { updateKnowledgeCollectionAction } = await import("./actions");
    await expect(
      updateKnowledgeCollectionAction("col-1", { name: "New" }),
    ).resolves.toEqual({ success: false, error: "Forbidden" });
    expect(updateReturningMock).not.toHaveBeenCalled();
  });

  it("returns 'Name is required' when blanking the name", async () => {
    getSessionMock.mockResolvedValue(ADMIN);
    canAccessMock.mockResolvedValue(true);
    const { updateKnowledgeCollectionAction } = await import("./actions");
    await expect(
      updateKnowledgeCollectionAction("col-1", { name: "  " }),
    ).resolves.toEqual({ success: false, error: "Name is required" });
    expect(updateReturningMock).not.toHaveBeenCalled();
  });

  it("returns the updated row on success", async () => {
    getSessionMock.mockResolvedValue(ADMIN);
    canAccessMock.mockResolvedValue(true);
    const { updateKnowledgeCollectionAction } = await import("./actions");
    const result = await updateKnowledgeCollectionAction("col-1", {
      name: "Renamed",
    });
    expect(result.success).toBe(true);
    expect((result as { data: { name: string } }).data.name).toBe("Renamed");
  });
});

describe("deleteKnowledgeCollectionAction", () => {
  it("returns a structured Admin required failure for non-admins", async () => {
    getSessionMock.mockResolvedValue(PLAIN);
    const { deleteKnowledgeCollectionAction } = await import("./actions");
    await expect(deleteKnowledgeCollectionAction("col-1")).resolves.toEqual({
      success: false,
      error: "Admin required",
    });
  });

  it("returns 'Collection not found' for a missing collection", async () => {
    getSessionMock.mockResolvedValue(ADMIN);
    selectWhereMock.mockResolvedValue([]);
    const { deleteKnowledgeCollectionAction } = await import("./actions");
    await expect(deleteKnowledgeCollectionAction("nope")).resolves.toEqual({
      success: false,
      error: "Collection not found",
    });
  });

  it("succeeds for an admin", async () => {
    getSessionMock.mockResolvedValue(ADMIN);
    const { deleteKnowledgeCollectionAction } = await import("./actions");
    await expect(deleteKnowledgeCollectionAction("col-1")).resolves.toEqual({
      success: true,
      data: undefined,
    });
  });
});

describe("ingestKnowledgeTextAction", () => {
  it("returns 'Text is required' for blank text", async () => {
    getSessionMock.mockResolvedValue(ADMIN);
    const { ingestKnowledgeTextAction } = await import("./actions");
    await expect(
      ingestKnowledgeTextAction({ collectionId: "col-1", text: "  " }),
    ).resolves.toEqual({ success: false, error: "Text is required" });
    expect(ingestDocumentMock).not.toHaveBeenCalled();
  });

  it("returns the chunk count on success", async () => {
    getSessionMock.mockResolvedValue(ADMIN);
    const { ingestKnowledgeTextAction } = await import("./actions");
    await expect(
      ingestKnowledgeTextAction({ collectionId: "col-1", text: "hello" }),
    ).resolves.toEqual({
      success: true,
      data: { chunks: 3, sourceRef: "manual" },
    });
  });
});

describe("deleteKnowledgeDocumentAction", () => {
  it("returns 'Document not found' when no chunks match", async () => {
    getSessionMock.mockResolvedValue(ADMIN);
    deleteReturningMock.mockResolvedValue([]);
    const { deleteKnowledgeDocumentAction } = await import("./actions");
    await expect(
      deleteKnowledgeDocumentAction({ collectionId: "col-1", sourceRef: "x" }),
    ).resolves.toEqual({ success: false, error: "Document not found" });
  });

  it("returns the deleted chunk count on success", async () => {
    getSessionMock.mockResolvedValue(ADMIN);
    deleteReturningMock.mockResolvedValue([{ id: "a" }, { id: "b" }]);
    const { deleteKnowledgeDocumentAction } = await import("./actions");
    await expect(
      deleteKnowledgeDocumentAction({ collectionId: "col-1", sourceRef: "x" }),
    ).resolves.toEqual({ success: true, data: { deletedChunks: 2 } });
  });
});
