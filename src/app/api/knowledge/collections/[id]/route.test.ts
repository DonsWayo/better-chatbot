import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

const { getSessionMock, dbSelectMock, dbDeleteMock } = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  dbSelectMock: vi.fn(),
  dbDeleteMock: vi.fn(),
}));

vi.mock("lib/auth/server", () => ({ getSession: getSessionMock }));

const dbSelectWhereMock = vi.fn().mockResolvedValue([]);
const dbSelectFromMock = vi.fn().mockReturnValue({ where: dbSelectWhereMock });
dbSelectMock.mockReturnValue({ from: dbSelectFromMock });

const dbDeleteWhereMock = vi.fn().mockResolvedValue([]);
dbDeleteMock.mockReturnValue({ where: dbDeleteWhereMock });

vi.mock("lib/db/pg/db.pg", () => ({
  pgDb: { select: dbSelectMock, delete: dbDeleteMock },
}));
vi.mock("lib/db/pg/schema.pg", () => ({
  AsafeKnowledgeCollectionTable: { id: "id" },
}));
vi.mock("drizzle-orm", () => ({
  eq: vi.fn((_a: unknown, _b: unknown) => ({})),
}));

function makeRequest(): NextRequest {
  return {} as unknown as NextRequest;
}

describe("GET /api/knowledge/collections/[id]", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns 401 when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), { params: Promise.resolve({ id: "col-1" }) });
    expect(res.status).toBe(401);
  });

  it("returns 404 when collection not found", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1", role: "user" } });
    dbSelectWhereMock.mockResolvedValueOnce([]);
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), { params: Promise.resolve({ id: "missing" }) });
    expect(res.status).toBe(404);
  });

  it("returns 200 with collection for authenticated user", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1", role: "user" } });
    dbSelectWhereMock.mockResolvedValueOnce([{ id: "col-1", name: "Docs" }]);
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), { params: Promise.resolve({ id: "col-1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.collection.name).toBe("Docs");
  });
});

describe("DELETE /api/knowledge/collections/[id]", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns 401 when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { DELETE } = await import("./route");
    const res = await DELETE(makeRequest(), { params: Promise.resolve({ id: "col-1" }) });
    expect(res.status).toBe(401);
  });

  it("returns 404 when collection not found", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "a1", role: "admin" } });
    dbSelectWhereMock.mockResolvedValueOnce([]);
    const { DELETE } = await import("./route");
    const res = await DELETE(makeRequest(), { params: Promise.resolve({ id: "missing" }) });
    expect(res.status).toBe(404);
  });

  it("returns 403 for non-admin", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1", role: "user" } });
    dbSelectWhereMock.mockResolvedValueOnce([{ id: "col-1" }]);
    const { DELETE } = await import("./route");
    const res = await DELETE(makeRequest(), { params: Promise.resolve({ id: "col-1" }) });
    expect(res.status).toBe(403);
  });

  it("returns 200 ok when collection deleted", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "a1", role: "admin" } });
    dbSelectWhereMock.mockResolvedValueOnce([{ id: "col-1" }]);
    const { DELETE } = await import("./route");
    const res = await DELETE(makeRequest(), { params: Promise.resolve({ id: "col-1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it("returns 403 for editor role", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "e1", role: "editor" } });
    dbSelectWhereMock.mockResolvedValueOnce([{ id: "col-1" }]);
    const { DELETE } = await import("./route");
    const res = await DELETE(makeRequest(), { params: Promise.resolve({ id: "col-1" }) });
    expect(res.status).toBe(403);
  });
});

describe("GET /api/knowledge/collections/[id] — guard chains", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("200 response body has collection key", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1", role: "user" } });
    dbSelectWhereMock.mockResolvedValueOnce([{ id: "col-1", name: "Docs" }]);
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), { params: Promise.resolve({ id: "col-1" }) });
    const body = await res.json();
    expect(body).toHaveProperty("collection");
  });
});

describe("DELETE /api/knowledge/collections/[id] — guard chains", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("never calls delete when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { DELETE } = await import("./route");
    await DELETE(makeRequest(), { params: Promise.resolve({ id: "col-1" }) });
    expect(dbDeleteMock).not.toHaveBeenCalled();
  });

  it("never calls delete for non-admin", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1", role: "user" } });
    dbSelectWhereMock.mockResolvedValueOnce([{ id: "col-1" }]);
    const { DELETE } = await import("./route");
    await DELETE(makeRequest(), { params: Promise.resolve({ id: "col-1" }) });
    expect(dbDeleteMock).not.toHaveBeenCalled();
  });
});

describe("GET /api/knowledge/collections/[id] — additional", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("never calls dbSelect when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    await GET(makeRequest(), { params: Promise.resolve({ id: "col-1" }) });
    expect(dbSelectMock).not.toHaveBeenCalled();
  });

  it("getSession called exactly once per GET", async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    await GET(makeRequest(), { params: Promise.resolve({ id: "col-1" }) });
    expect(getSessionMock).toHaveBeenCalledTimes(1);
  });

  it("404 when collection not found returns non-200 status", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1", role: "user" } });
    dbSelectWhereMock.mockResolvedValueOnce([]);
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), { params: Promise.resolve({ id: "missing" }) });
    expect(res.status).not.toBe(200);
  });
});

describe("DELETE /api/knowledge/collections/[id] — additional", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("never calls dbSelect when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { DELETE } = await import("./route");
    await DELETE(makeRequest(), { params: Promise.resolve({ id: "col-1" }) });
    expect(dbSelectMock).not.toHaveBeenCalled();
  });

  it("getSession called exactly once per DELETE", async () => {
    getSessionMock.mockResolvedValue(null);
    const { DELETE } = await import("./route");
    await DELETE(makeRequest(), { params: Promise.resolve({ id: "col-1" }) });
    expect(getSessionMock).toHaveBeenCalledTimes(1);
  });

  it("dbDelete called exactly once on successful admin delete", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "a1", role: "admin" } });
    dbSelectWhereMock.mockResolvedValueOnce([{ id: "col-1" }]);
    const { DELETE } = await import("./route");
    await DELETE(makeRequest(), { params: Promise.resolve({ id: "col-1" }) });
    expect(dbDeleteMock).toHaveBeenCalledTimes(1);
  });

  it("never calls dbDelete when collection not found", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "a1", role: "admin" } });
    dbSelectWhereMock.mockResolvedValueOnce([]);
    const { DELETE } = await import("./route");
    await DELETE(makeRequest(), { params: Promise.resolve({ id: "missing" }) });
    expect(dbDeleteMock).not.toHaveBeenCalled();
  });

  it("200 body has ok property", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "a1", role: "admin" } });
    dbSelectWhereMock.mockResolvedValueOnce([{ id: "col-1" }]);
    const { DELETE } = await import("./route");
    const res = await DELETE(makeRequest(), { params: Promise.resolve({ id: "col-1" }) });
    const body = await res.json();
    expect(body).toHaveProperty("ok");
  });
});

describe("GET /api/knowledge/collections/[id] — response shape", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("response is always a Response instance", async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), { params: Promise.resolve({ id: "col-1" }) });
    expect(res).toBeInstanceOf(Response);
  });

  it("200 body collection has id field", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1", role: "user" } });
    dbSelectWhereMock.mockResolvedValueOnce([{ id: "col-42", name: "Test" }]);
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), { params: Promise.resolve({ id: "col-42" }) });
    const body = await res.json();
    expect(body.collection).toHaveProperty("id");
  });

  it("dbSelectMock called exactly once per GET", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1", role: "user" } });
    dbSelectWhereMock.mockResolvedValueOnce([{ id: "col-1", name: "Test" }]);
    const { GET } = await import("./route");
    await GET(makeRequest(), { params: Promise.resolve({ id: "col-1" }) });
    expect(dbSelectMock).toHaveBeenCalledTimes(1);
  });

  it("DELETE response is always a Response instance", async () => {
    getSessionMock.mockResolvedValue(null);
    const { DELETE } = await import("./route");
    const res = await DELETE(makeRequest(), { params: Promise.resolve({ id: "col-1" }) });
    expect(res).toBeInstanceOf(Response);
  });
});
