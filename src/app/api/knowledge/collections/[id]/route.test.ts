import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

const { getSessionMock, dbSelectMock, dbDeleteMock, dbUpdateMock, canAccessMock } =
  vi.hoisted(() => ({
    getSessionMock: vi.fn(),
    dbSelectMock: vi.fn(),
    dbDeleteMock: vi.fn(),
    dbUpdateMock: vi.fn(),
    canAccessMock: vi.fn(),
  }));

vi.mock("lib/auth/server", () => ({ getSession: getSessionMock }));

const dbSelectWhereMock = vi.fn().mockResolvedValue([]);
const dbSelectFromMock = vi.fn().mockReturnValue({ where: dbSelectWhereMock });
dbSelectMock.mockReturnValue({ from: dbSelectFromMock });

const dbDeleteWhereMock = vi.fn().mockResolvedValue([]);
dbDeleteMock.mockReturnValue({ where: dbDeleteWhereMock });

const dbUpdateReturningMock = vi
  .fn()
  .mockResolvedValue([{ id: "col-1", name: "Updated" }]);
const dbUpdateWhereMock = vi
  .fn()
  .mockReturnValue({ returning: dbUpdateReturningMock });
const dbUpdateSetMock = vi.fn().mockReturnValue({ where: dbUpdateWhereMock });
dbUpdateMock.mockReturnValue({ set: dbUpdateSetMock });

vi.mock("lib/db/pg/db.pg", () => ({
  pgDb: { select: dbSelectMock, delete: dbDeleteMock, update: dbUpdateMock },
}));
vi.mock("lib/db/pg/schema.pg", () => ({
  AsafeKnowledgeCollectionTable: { id: "id" },
}));
vi.mock("drizzle-orm", () => ({
  eq: vi.fn((_a: unknown, _b: unknown) => ({})),
}));
vi.mock("lib/visibility", () => ({ canAccess: canAccessMock }));

function makeRequest(body?: unknown): NextRequest {
  return {
    json: () => Promise.resolve(body ?? {}),
  } as unknown as NextRequest;
}

const params = (id = "col-1") => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.clearAllMocks();
  dbSelectMock.mockReturnValue({ from: dbSelectFromMock });
  dbSelectFromMock.mockReturnValue({ where: dbSelectWhereMock });
  dbSelectWhereMock.mockResolvedValue([]);
  dbDeleteMock.mockReturnValue({ where: dbDeleteWhereMock });
  dbUpdateMock.mockReturnValue({ set: dbUpdateSetMock });
  dbUpdateSetMock.mockReturnValue({ where: dbUpdateWhereMock });
  dbUpdateWhereMock.mockReturnValue({ returning: dbUpdateReturningMock });
  canAccessMock.mockResolvedValue(true);
});

describe("GET /api/knowledge/collections/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), params());
    expect(res.status).toBe(401);
    expect(dbSelectMock).not.toHaveBeenCalled();
  });

  it("returns 404 when collection not found", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1", role: "user" } });
    dbSelectWhereMock.mockResolvedValueOnce([]);
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), params("missing"));
    expect(res.status).toBe(404);
  });

  it("returns 200 with collection for a user with view access", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1", role: "user" } });
    dbSelectWhereMock.mockResolvedValueOnce([{ id: "col-1", name: "Docs" }]);
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), params());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.collection.name).toBe("Docs");
    expect(canAccessMock).toHaveBeenCalledWith(
      "knowledge_collection",
      "col-1",
      "u1",
      "view",
    );
  });

  it("returns 403 when the unified resolver denies view", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1", role: "user" } });
    dbSelectWhereMock.mockResolvedValueOnce([{ id: "col-1", name: "Docs" }]);
    canAccessMock.mockResolvedValueOnce(false);
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), params());
    expect(res.status).toBe(403);
  });

  it("getSession called exactly once per GET", async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    await GET(makeRequest(), params());
    expect(getSessionMock).toHaveBeenCalledTimes(1);
  });

  it("response is always a Response instance", async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), params());
    expect(res).toBeInstanceOf(Response);
  });
});

describe("PATCH /api/knowledge/collections/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { PATCH } = await import("./route");
    const res = await PATCH(makeRequest({ name: "New" }), params());
    expect(res.status).toBe(401);
    expect(dbUpdateMock).not.toHaveBeenCalled();
  });

  it("returns 404 when collection not found", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1", role: "user" } });
    dbSelectWhereMock.mockResolvedValueOnce([]);
    const { PATCH } = await import("./route");
    const res = await PATCH(makeRequest({ name: "New" }), params("missing"));
    expect(res.status).toBe(404);
  });

  it("returns 403 without manage access and never updates", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1", role: "user" } });
    dbSelectWhereMock.mockResolvedValueOnce([{ id: "col-1" }]);
    canAccessMock.mockResolvedValueOnce(false);
    const { PATCH } = await import("./route");
    const res = await PATCH(makeRequest({ name: "New" }), params());
    expect(res.status).toBe(403);
    expect(canAccessMock).toHaveBeenCalledWith(
      "knowledge_collection",
      "col-1",
      "u1",
      "manage",
    );
    expect(dbUpdateMock).not.toHaveBeenCalled();
  });

  it("updates name/description/visibility for a manager", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "a1", role: "admin" } });
    dbSelectWhereMock.mockResolvedValueOnce([{ id: "col-1" }]);
    const { PATCH } = await import("./route");
    const res = await PATCH(
      makeRequest({ name: "New", description: "d", visibility: "team" }),
      params(),
    );
    expect(res.status).toBe(200);
    expect(dbUpdateSetMock).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "New",
        description: "d",
        visibility: "team",
      }),
    );
  });

  it("normalizes legacy 'org' to 'company' on update", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "a1", role: "admin" } });
    dbSelectWhereMock.mockResolvedValueOnce([{ id: "col-1" }]);
    const { PATCH } = await import("./route");
    await PATCH(makeRequest({ visibility: "org" }), params());
    expect(dbUpdateSetMock).toHaveBeenCalledWith(
      expect.objectContaining({ visibility: "company" }),
    );
  });

  it("returns 400 for an unknown visibility value", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "a1", role: "admin" } });
    dbSelectWhereMock.mockResolvedValueOnce([{ id: "col-1" }]);
    const { PATCH } = await import("./route");
    const res = await PATCH(makeRequest({ visibility: "banana" }), params());
    expect(res.status).toBe(400);
    expect(dbUpdateMock).not.toHaveBeenCalled();
  });

  it("syncs legacy teamId to teamIds[0] when teamIds change", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "a1", role: "admin" } });
    dbSelectWhereMock.mockResolvedValueOnce([{ id: "col-1" }]);
    const { PATCH } = await import("./route");
    await PATCH(makeRequest({ teamIds: ["t1", "t2"] }), params());
    expect(dbUpdateSetMock).toHaveBeenCalledWith(
      expect.objectContaining({ teamIds: ["t1", "t2"], teamId: "t1" }),
    );
  });

  it("clears teams when teamIds is set to null", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "a1", role: "admin" } });
    dbSelectWhereMock.mockResolvedValueOnce([{ id: "col-1" }]);
    const { PATCH } = await import("./route");
    await PATCH(makeRequest({ teamIds: null }), params());
    expect(dbUpdateSetMock).toHaveBeenCalledWith(
      expect.objectContaining({ teamIds: null, teamId: null }),
    );
  });

  it("returns 400 when name is set to empty string", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "a1", role: "admin" } });
    dbSelectWhereMock.mockResolvedValueOnce([{ id: "col-1" }]);
    const { PATCH } = await import("./route");
    const res = await PATCH(makeRequest({ name: "" }), params());
    expect(res.status).toBe(400);
  });

  it("200 body has the updated collection", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "a1", role: "admin" } });
    dbSelectWhereMock.mockResolvedValueOnce([{ id: "col-1" }]);
    const { PATCH } = await import("./route");
    const res = await PATCH(makeRequest({ name: "Updated" }), params());
    const body = await res.json();
    expect(body.collection.name).toBe("Updated");
  });
});

describe("DELETE /api/knowledge/collections/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { DELETE } = await import("./route");
    const res = await DELETE(makeRequest(), params());
    expect(res.status).toBe(401);
    expect(dbDeleteMock).not.toHaveBeenCalled();
    expect(dbSelectMock).not.toHaveBeenCalled();
  });

  it("returns 404 when collection not found", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "a1", role: "admin" } });
    dbSelectWhereMock.mockResolvedValueOnce([]);
    const { DELETE } = await import("./route");
    const res = await DELETE(makeRequest(), params("missing"));
    expect(res.status).toBe(404);
    expect(dbDeleteMock).not.toHaveBeenCalled();
  });

  it("returns 403 for non-admin and never deletes", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1", role: "user" } });
    dbSelectWhereMock.mockResolvedValueOnce([{ id: "col-1" }]);
    const { DELETE } = await import("./route");
    const res = await DELETE(makeRequest(), params());
    expect(res.status).toBe(403);
    expect(dbDeleteMock).not.toHaveBeenCalled();
  });

  it("returns 403 for editor role", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "e1", role: "editor" } });
    dbSelectWhereMock.mockResolvedValueOnce([{ id: "col-1" }]);
    const { DELETE } = await import("./route");
    const res = await DELETE(makeRequest(), params());
    expect(res.status).toBe(403);
  });

  it("returns 200 ok when collection deleted by admin", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "a1", role: "admin" } });
    dbSelectWhereMock.mockResolvedValueOnce([{ id: "col-1" }]);
    const { DELETE } = await import("./route");
    const res = await DELETE(makeRequest(), params());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(dbDeleteMock).toHaveBeenCalledTimes(1);
  });

  it("getSession called exactly once per DELETE", async () => {
    getSessionMock.mockResolvedValue(null);
    const { DELETE } = await import("./route");
    await DELETE(makeRequest(), params());
    expect(getSessionMock).toHaveBeenCalledTimes(1);
  });

  it("DELETE response is always a Response instance", async () => {
    getSessionMock.mockResolvedValue(null);
    const { DELETE } = await import("./route");
    const res = await DELETE(makeRequest(), params());
    expect(res).toBeInstanceOf(Response);
  });
});
