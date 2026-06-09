import { describe, it, expect, vi, beforeEach } from "vitest";

const { getSessionMock, dbSelectMock, ingestDocumentMock } = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  dbSelectMock: vi.fn(),
  ingestDocumentMock: vi.fn(),
}));

vi.mock("lib/auth/server", () => ({ getSession: getSessionMock }));
vi.mock("lib/ai/embeddings/ingest", () => ({ ingestDocument: ingestDocumentMock }));

const dbSelectWhereMock = vi.fn().mockResolvedValue([]);
const dbSelectFromMock = vi.fn().mockReturnValue({ where: dbSelectWhereMock });
dbSelectMock.mockReturnValue({ from: dbSelectFromMock });

vi.mock("lib/db/pg/db.pg", () => ({
  pgDb: { select: dbSelectMock },
}));
vi.mock("lib/db/pg/schema.pg", () => ({
  AsafeKnowledgeCollectionTable: { id: "id" },
}));
vi.mock("drizzle-orm", () => ({
  eq: vi.fn((_a: unknown, _b: unknown) => ({})),
}));
vi.mock("lib/file-storage", () => ({
  serverFileStorage: { download: vi.fn() },
}));
vi.mock("lib/file-storage/storage-utils", () => ({
  storageKeyFromUrl: vi.fn((url: string) => url.split("/").pop()),
}));

function makeRequest(body?: unknown): Request {
  return {
    json: () => Promise.resolve(body),
  } as unknown as Request;
}

describe("POST /api/knowledge/ingest", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns 401 when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ collectionId: "col-1", text: "hello" }));
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-admin", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1", role: "user" } });
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ collectionId: "col-1", text: "hello" }));
    expect(res.status).toBe(403);
  });

  it("returns 400 when collectionId is missing", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "a1", role: "admin" } });
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ text: "hello" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/collectionId/);
  });

  it("returns 404 when collection not found", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "a1", role: "admin" } });
    dbSelectWhereMock.mockResolvedValueOnce([]);
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ collectionId: "missing", text: "hello" }));
    expect(res.status).toBe(404);
  });

  it("returns 400 when no text or key provided", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "a1", role: "admin" } });
    dbSelectWhereMock.mockResolvedValueOnce([{ id: "col-1" }]);
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ collectionId: "col-1" }));
    expect(res.status).toBe(400);
  });

  it("ingests text and returns chunk count", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "a1", role: "admin" } });
    dbSelectWhereMock.mockResolvedValueOnce([{ id: "col-1" }]);
    ingestDocumentMock.mockResolvedValueOnce(5);
    const { POST } = await import("./route");
    const res = await POST(makeRequest({
      collectionId: "col-1",
      text: "Long document content here…",
      sourceRef: "policy.md",
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.chunks).toBe(5);
    expect(body.sourceRef).toBe("policy.md");
    expect(ingestDocumentMock).toHaveBeenCalledWith(
      "Long document content here…",
      { collectionId: "col-1", sourceRef: "policy.md", maxTokens: undefined },
    );
  });

  it("never calls dbSelect when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    await POST(makeRequest({ collectionId: "col-1", text: "hello" }));
    expect(dbSelectMock).not.toHaveBeenCalled();
  });

  it("never calls ingestDocument when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    await POST(makeRequest({ collectionId: "col-1", text: "hello" }));
    expect(ingestDocumentMock).not.toHaveBeenCalled();
  });

  it("never calls ingestDocument for non-admin", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1", role: "user" } });
    const { POST } = await import("./route");
    await POST(makeRequest({ collectionId: "col-1", text: "hello" }));
    expect(ingestDocumentMock).not.toHaveBeenCalled();
  });

  it("never calls ingestDocument when collection is not found", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "a1", role: "admin" } });
    dbSelectWhereMock.mockResolvedValueOnce([]);
    const { POST } = await import("./route");
    await POST(makeRequest({ collectionId: "missing", text: "hello" }));
    expect(ingestDocumentMock).not.toHaveBeenCalled();
  });

  it("401 body has error field", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ collectionId: "col-1", text: "hi" }));
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("403 body has error field", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1", role: "user" } });
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ collectionId: "col-1", text: "hi" }));
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("ingestDocument called exactly once on success", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "a1", role: "admin" } });
    dbSelectWhereMock.mockResolvedValueOnce([{ id: "col-1" }]);
    ingestDocumentMock.mockResolvedValueOnce(3);
    const { POST } = await import("./route");
    await POST(makeRequest({ collectionId: "col-1", text: "some text" }));
    expect(ingestDocumentMock).toHaveBeenCalledTimes(1);
  });

  it("response body includes collectionId on success", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "a1", role: "admin" } });
    dbSelectWhereMock.mockResolvedValueOnce([{ id: "col-xyz" }]);
    ingestDocumentMock.mockResolvedValueOnce(2);
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ collectionId: "col-xyz", text: "content" }));
    const body = await res.json();
    expect(body.collectionId).toBe("col-xyz");
  });
});
