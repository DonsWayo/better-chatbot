import { describe, it, expect, vi, beforeEach } from "vitest";

const { getSessionMock, dbSelectMock, dbInsertMock } = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  dbSelectMock: vi.fn(),
  dbInsertMock: vi.fn(),
}));

vi.mock("lib/auth/server", () => ({ getSession: getSessionMock }));

const dbSelectWhereMock = vi.fn().mockResolvedValue([]);
const dbSelectFromMock = vi.fn().mockReturnValue({ where: dbSelectWhereMock });
dbSelectMock.mockReturnValue({ from: dbSelectFromMock });

const dbInsertReturningMock = vi.fn().mockResolvedValue([{ id: "col-1", name: "Docs" }]);
const dbInsertValuesMock = vi.fn().mockReturnValue({ returning: dbInsertReturningMock });
dbInsertMock.mockReturnValue({ values: dbInsertValuesMock });

vi.mock("lib/db/pg/db.pg", () => ({
  pgDb: { select: dbSelectMock, insert: dbInsertMock },
}));
vi.mock("lib/db/pg/schema.pg", () => ({
  AsafeKnowledgeCollectionTable: { id: "id", name: "name", visibility: "visibility", teamId: "teamId", createdAt: "createdAt" },
}));

function makeRequest(body?: unknown): Request {
  return {
    json: () => Promise.resolve(body),
  } as unknown as Request;
}

describe("GET /api/knowledge/collections", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns 401 when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns 200 with collections for any authenticated user", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1", role: "user" } });
    // Mock select chain to return collections directly
    const selectAllMock = vi.fn().mockResolvedValue([{ id: "col-1", name: "Docs" }]);
    dbSelectMock.mockReturnValueOnce({ from: selectAllMock });
    const { GET } = await import("./route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.collections).toHaveLength(1);
  });
});

describe("POST /api/knowledge/collections", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns 401 when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ name: "Test" }));
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-admin", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1", role: "user" } });
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ name: "Test" }));
    expect(res.status).toBe(403);
  });

  it("returns 400 when name is missing", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "a1", role: "admin" } });
    const { POST } = await import("./route");
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it("creates collection and returns 200 for admin", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "a1", role: "admin" } });
    dbInsertReturningMock.mockResolvedValueOnce([{ id: "col-new", name: "Product Docs", visibility: "org" }]);
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ name: "Product Docs", visibility: "org" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.collection.name).toBe("Product Docs");
  });

  it("never calls db.insert when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    await POST(makeRequest({ name: "Test" }));
    expect(dbInsertMock).not.toHaveBeenCalled();
  });

  it("never calls db.insert when non-admin user", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1", role: "user" } });
    const { POST } = await import("./route");
    await POST(makeRequest({ name: "Test" }));
    expect(dbInsertMock).not.toHaveBeenCalled();
  });

  it("returns 400 when name is empty string", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "a1", role: "admin" } });
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ name: "" }));
    expect(res.status).toBe(400);
  });
});

describe("GET /api/knowledge/collections — guard chains", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("never calls db.select when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    await GET();
    expect(dbSelectMock).not.toHaveBeenCalled();
  });

  it("returns empty collections array when DB returns nothing", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1", role: "user" } });
    const selectAllMock = vi.fn().mockResolvedValue([]);
    dbSelectMock.mockReturnValueOnce({ from: selectAllMock });
    const { GET } = await import("./route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.collections).toHaveLength(0);
  });
});
