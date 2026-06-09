import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

const { getSessionMock, dbUpdateMock, dbDeleteMock } = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  dbUpdateMock: vi.fn(),
  dbDeleteMock: vi.fn(),
}));

vi.mock("lib/auth/server", () => ({ getSession: getSessionMock }));

const dbUpdateReturningMock = vi.fn().mockResolvedValue([{ id: "srv-1", name: "Updated", enabled: false }]);
const dbUpdateWhereMock = vi.fn().mockReturnValue({ returning: dbUpdateReturningMock });
const dbUpdateSetMock = vi.fn().mockReturnValue({ where: dbUpdateWhereMock });
dbUpdateMock.mockReturnValue({ set: dbUpdateSetMock });

const dbDeleteReturningMock = vi.fn().mockResolvedValue([{ id: "srv-1" }]);
const dbDeleteWhereMock = vi.fn().mockReturnValue({ returning: dbDeleteReturningMock });
dbDeleteMock.mockReturnValue({ where: dbDeleteWhereMock });

vi.mock("lib/db/pg/db.pg", () => ({
  pgDb: { update: dbUpdateMock, delete: dbDeleteMock },
}));
vi.mock("lib/db/pg/schema.pg", () => ({
  McpServerTable: { id: "id", scope: "scope", enabled: "enabled", updatedAt: "updatedAt" },
}));
vi.mock("drizzle-orm", () => ({
  eq: vi.fn((_a: unknown, _b: unknown) => ({})),
  and: vi.fn((..._args: unknown[]) => ({})),
  inArray: vi.fn((_col: unknown, _vals: unknown) => ({})),
}));

function makeRequest(body?: unknown): NextRequest {
  return {
    headers: new Headers({ "content-type": "application/json" }),
    json: () => Promise.resolve(body),
  } as unknown as NextRequest;
}

describe("PATCH /api/admin/mcp/servers/[id]", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns 401 when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { PATCH } = await import("./route");
    const res = await PATCH(makeRequest({}), { params: Promise.resolve({ id: "srv-1" }) });
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-admin", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1", role: "user" } });
    const { PATCH } = await import("./route");
    const res = await PATCH(makeRequest({ enabled: true }), { params: Promise.resolve({ id: "srv-1" }) });
    expect(res.status).toBe(403);
  });

  it("returns 404 when server not found", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "a1", role: "admin" } });
    dbUpdateReturningMock.mockResolvedValueOnce([]);
    const { PATCH } = await import("./route");
    const res = await PATCH(makeRequest({ enabled: false }), { params: Promise.resolve({ id: "missing" }) });
    expect(res.status).toBe(404);
  });

  it("returns 200 with updated server on success", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "a1", role: "admin" } });
    dbUpdateReturningMock.mockResolvedValueOnce([{ id: "srv-1", name: "Test", enabled: false }]);
    const { PATCH } = await import("./route");
    const res = await PATCH(makeRequest({ enabled: false }), { params: Promise.resolve({ id: "srv-1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.server.enabled).toBe(false);
  });

  it("never calls dbUpdate when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { PATCH } = await import("./route");
    await PATCH(makeRequest({ enabled: true }), { params: Promise.resolve({ id: "srv-1" }) });
    expect(dbUpdateMock).not.toHaveBeenCalled();
  });

  it("never calls dbUpdate for non-admin", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1", role: "user" } });
    const { PATCH } = await import("./route");
    await PATCH(makeRequest({ enabled: true }), { params: Promise.resolve({ id: "srv-1" }) });
    expect(dbUpdateMock).not.toHaveBeenCalled();
  });

  it("returns 403 for editor role", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "e1", role: "editor" } });
    const { PATCH } = await import("./route");
    const res = await PATCH(makeRequest({ enabled: true }), { params: Promise.resolve({ id: "srv-1" }) });
    expect(res.status).toBe(403);
  });

  it("401 body has error field", async () => {
    getSessionMock.mockResolvedValue(null);
    const { PATCH } = await import("./route");
    const res = await PATCH(makeRequest({}), { params: Promise.resolve({ id: "srv-1" }) });
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("403 body has error field", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1", role: "user" } });
    const { PATCH } = await import("./route");
    const res = await PATCH(makeRequest({}), { params: Promise.resolve({ id: "srv-1" }) });
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });
});

describe("DELETE /api/admin/mcp/servers/[id]", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns 401 when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { DELETE } = await import("./route");
    const res = await DELETE(makeRequest(), { params: Promise.resolve({ id: "srv-1" }) });
    expect(res.status).toBe(401);
  });

  it("returns 404 when server not found", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "a1", role: "admin" } });
    dbDeleteReturningMock.mockResolvedValueOnce([]);
    const { DELETE } = await import("./route");
    const res = await DELETE(makeRequest(), { params: Promise.resolve({ id: "missing" }) });
    expect(res.status).toBe(404);
  });

  it("returns 200 ok when server deleted", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "a1", role: "admin" } });
    dbDeleteReturningMock.mockResolvedValueOnce([{ id: "srv-1" }]);
    const { DELETE } = await import("./route");
    const res = await DELETE(makeRequest(), { params: Promise.resolve({ id: "srv-1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.id).toBe("srv-1");
  });

  it("returns 403 for non-admin", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1", role: "user" } });
    const { DELETE } = await import("./route");
    const res = await DELETE(makeRequest(), { params: Promise.resolve({ id: "srv-1" }) });
    expect(res.status).toBe(403);
  });

  it("never calls dbDelete when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { DELETE } = await import("./route");
    await DELETE(makeRequest(), { params: Promise.resolve({ id: "srv-1" }) });
    expect(dbDeleteMock).not.toHaveBeenCalled();
  });

  it("never calls dbDelete for non-admin", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1", role: "user" } });
    const { DELETE } = await import("./route");
    await DELETE(makeRequest(), { params: Promise.resolve({ id: "srv-1" }) });
    expect(dbDeleteMock).not.toHaveBeenCalled();
  });

  it("401 body has error field", async () => {
    getSessionMock.mockResolvedValue(null);
    const { DELETE } = await import("./route");
    const res = await DELETE(makeRequest(), { params: Promise.resolve({ id: "srv-1" }) });
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("403 body has error field", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1", role: "user" } });
    const { DELETE } = await import("./route");
    const res = await DELETE(makeRequest(), { params: Promise.resolve({ id: "srv-1" }) });
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });
});

describe("PATCH /api/admin/mcp/servers/[id] — additional", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("getSession called exactly once per PATCH", async () => {
    getSessionMock.mockResolvedValue(null);
    const { PATCH } = await import("./route");
    await PATCH(makeRequest({}), { params: Promise.resolve({ id: "srv-1" }) });
    expect(getSessionMock).toHaveBeenCalledTimes(1);
  });

  it("dbUpdate called exactly once on admin success", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "a1", role: "admin" } });
    dbUpdateReturningMock.mockResolvedValueOnce([{ id: "srv-1", name: "Test", enabled: true }]);
    const { PATCH } = await import("./route");
    await PATCH(makeRequest({ enabled: true }), { params: Promise.resolve({ id: "srv-1" }) });
    expect(dbUpdateMock).toHaveBeenCalledTimes(1);
  });

  it("200 body has server.id field", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "a1", role: "admin" } });
    dbUpdateReturningMock.mockResolvedValueOnce([{ id: "srv-42", name: "Srv", enabled: false }]);
    const { PATCH } = await import("./route");
    const res = await PATCH(makeRequest({ enabled: false }), { params: Promise.resolve({ id: "srv-42" }) });
    const body = await res.json();
    expect(body.server.id).toBe("srv-42");
  });

  it("never calls dbUpdate for editor role", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "e1", role: "editor" } });
    const { PATCH } = await import("./route");
    await PATCH(makeRequest({ enabled: true }), { params: Promise.resolve({ id: "srv-1" }) });
    expect(dbUpdateMock).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/admin/mcp/servers/[id] — additional", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("getSession called exactly once per DELETE", async () => {
    getSessionMock.mockResolvedValue(null);
    const { DELETE } = await import("./route");
    await DELETE(makeRequest(), { params: Promise.resolve({ id: "srv-1" }) });
    expect(getSessionMock).toHaveBeenCalledTimes(1);
  });

  it("dbDelete called exactly once on admin success", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "a1", role: "admin" } });
    dbDeleteReturningMock.mockResolvedValueOnce([{ id: "srv-del" }]);
    const { DELETE } = await import("./route");
    await DELETE(makeRequest(), { params: Promise.resolve({ id: "srv-del" }) });
    expect(dbDeleteMock).toHaveBeenCalledTimes(1);
  });

  it("200 body has ok:true and id field", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "a1", role: "admin" } });
    dbDeleteReturningMock.mockResolvedValueOnce([{ id: "srv-check" }]);
    const { DELETE } = await import("./route");
    const res = await DELETE(makeRequest(), { params: Promise.resolve({ id: "srv-check" }) });
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.id).toBe("srv-check");
  });
});
