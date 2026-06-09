import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

const { getSessionMock, dbSelectMock, removeTeamMemberMock } = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  dbSelectMock: vi.fn(),
  removeTeamMemberMock: vi.fn(),
}));

vi.mock("lib/auth/server", () => ({ getSession: getSessionMock }));
vi.mock("lib/admin/teams", () => ({ removeTeamMember: removeTeamMemberMock }));

const dbSelectWhereMock = vi.fn().mockResolvedValue([{ id: "mem-1" }]);
const dbSelectFromMock = vi.fn().mockReturnValue({ where: dbSelectWhereMock });
dbSelectMock.mockReturnValue({ from: dbSelectFromMock });

vi.mock("lib/db/pg/db.pg", () => ({
  pgDb: { select: dbSelectMock },
}));
vi.mock("lib/db/pg/schema.pg", () => ({
  AsafeTeamMemberTable: { id: "id", teamId: "teamId" },
}));
vi.mock("drizzle-orm", () => ({
  eq: vi.fn((_a: unknown, _b: unknown) => ({})),
  and: vi.fn((..._args: unknown[]) => ({})),
}));

function makeRequest(): NextRequest {
  return {} as unknown as NextRequest;
}

describe("DELETE /api/admin/teams/[id]/members/[memberId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbSelectFromMock.mockReturnValue({ where: dbSelectWhereMock });
    dbSelectMock.mockReturnValue({ from: dbSelectFromMock });
  });

  it("returns 401 when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { DELETE } = await import("./route");
    const res = await DELETE(makeRequest(), { params: Promise.resolve({ id: "t-1", memberId: "mem-1" }) });
    expect(res.status).toBe(401);
  });

  it("never calls db.select when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { DELETE } = await import("./route");
    await DELETE(makeRequest(), { params: Promise.resolve({ id: "t-1", memberId: "mem-1" }) });
    expect(dbSelectMock).not.toHaveBeenCalled();
  });

  it("returns 403 for non-admin", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1", role: "user" } });
    const { DELETE } = await import("./route");
    const res = await DELETE(makeRequest(), { params: Promise.resolve({ id: "t-1", memberId: "mem-1" }) });
    expect(res.status).toBe(403);
  });

  it("returns 403 for editor role", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "e1", role: "editor" } });
    const { DELETE } = await import("./route");
    const res = await DELETE(makeRequest(), { params: Promise.resolve({ id: "t-1", memberId: "mem-1" }) });
    expect(res.status).toBe(403);
  });

  it("never calls removeTeamMember when not admin", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1", role: "user" } });
    const { DELETE } = await import("./route");
    await DELETE(makeRequest(), { params: Promise.resolve({ id: "t-1", memberId: "mem-1" }) });
    expect(removeTeamMemberMock).not.toHaveBeenCalled();
  });

  it("returns 404 when member not found in this team", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "a1", role: "admin" } });
    dbSelectWhereMock.mockResolvedValueOnce([]);
    const { DELETE } = await import("./route");
    const res = await DELETE(makeRequest(), { params: Promise.resolve({ id: "t-1", memberId: "missing" }) });
    expect(res.status).toBe(404);
  });

  it("never calls removeTeamMember when member not found", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "a1", role: "admin" } });
    dbSelectWhereMock.mockResolvedValueOnce([]);
    const { DELETE } = await import("./route");
    await DELETE(makeRequest(), { params: Promise.resolve({ id: "t-1", memberId: "missing" }) });
    expect(removeTeamMemberMock).not.toHaveBeenCalled();
  });

  it("removes member and returns ok", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "a1", role: "admin" } });
    dbSelectWhereMock.mockResolvedValueOnce([{ id: "mem-1" }]);
    removeTeamMemberMock.mockResolvedValueOnce(undefined);
    const { DELETE } = await import("./route");
    const res = await DELETE(makeRequest(), { params: Promise.resolve({ id: "t-1", memberId: "mem-1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(removeTeamMemberMock).toHaveBeenCalledWith("mem-1");
  });

  it("passes correct memberId to removeTeamMember", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "a1", role: "admin" } });
    dbSelectWhereMock.mockResolvedValueOnce([{ id: "mem-unique-999" }]);
    removeTeamMemberMock.mockResolvedValueOnce(undefined);
    const { DELETE } = await import("./route");
    await DELETE(makeRequest(), { params: Promise.resolve({ id: "t-2", memberId: "mem-unique-999" }) });
    expect(removeTeamMemberMock).toHaveBeenCalledWith("mem-unique-999");
  });

  it("401 body has error field", async () => {
    getSessionMock.mockResolvedValue(null);
    const { DELETE } = await import("./route");
    const res = await DELETE(makeRequest(), { params: Promise.resolve({ id: "t-1", memberId: "mem-1" }) });
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("403 body has error field", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1", role: "user" } });
    const { DELETE } = await import("./route");
    const res = await DELETE(makeRequest(), { params: Promise.resolve({ id: "t-1", memberId: "mem-1" }) });
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("404 body has error field", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "a1", role: "admin" } });
    dbSelectWhereMock.mockResolvedValueOnce([]);
    const { DELETE } = await import("./route");
    const res = await DELETE(makeRequest(), { params: Promise.resolve({ id: "t-1", memberId: "missing" }) });
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("removeTeamMember called exactly once on success", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "a1", role: "admin" } });
    dbSelectWhereMock.mockResolvedValueOnce([{ id: "mem-1" }]);
    removeTeamMemberMock.mockResolvedValueOnce(undefined);
    const { DELETE } = await import("./route");
    await DELETE(makeRequest(), { params: Promise.resolve({ id: "t-1", memberId: "mem-1" }) });
    expect(removeTeamMemberMock).toHaveBeenCalledTimes(1);
  });

  it("dbSelect called exactly once for admin request", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "a1", role: "admin" } });
    dbSelectWhereMock.mockResolvedValueOnce([]);
    const { DELETE } = await import("./route");
    await DELETE(makeRequest(), { params: Promise.resolve({ id: "t-1", memberId: "any" }) });
    expect(dbSelectMock).toHaveBeenCalledTimes(1);
  });

  it("200 response body has ok:true", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "a1", role: "admin" } });
    dbSelectWhereMock.mockResolvedValueOnce([{ id: "mem-7" }]);
    removeTeamMemberMock.mockResolvedValueOnce(undefined);
    const { DELETE } = await import("./route");
    const res = await DELETE(makeRequest(), { params: Promise.resolve({ id: "t-1", memberId: "mem-7" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("ok", true);
  });
});

describe("DELETE /api/admin/teams/[id]/members/[memberId] — call count invariants", () => {
  beforeEach(() => { vi.clearAllMocks(); vi.resetModules(); });

  it("getSession called exactly once per DELETE", async () => {
    getSessionMock.mockResolvedValue(null);
    const { DELETE } = await import("./route");
    await DELETE(makeRequest(), { params: Promise.resolve({ id: "t-1", memberId: "m-1" }) });
    expect(getSessionMock).toHaveBeenCalledTimes(1);
  });

  it("dbSelect not called when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { DELETE } = await import("./route");
    await DELETE(makeRequest(), { params: Promise.resolve({ id: "t-1", memberId: "m-1" }) });
    expect(dbSelectMock).not.toHaveBeenCalled();
  });

  it("removeTeamMember not called when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { DELETE } = await import("./route");
    await DELETE(makeRequest(), { params: Promise.resolve({ id: "t-1", memberId: "m-1" }) });
    expect(removeTeamMemberMock).not.toHaveBeenCalled();
  });

  it("DELETE returns 401 Response when session is null", async () => {
    getSessionMock.mockResolvedValue(null);
    const { DELETE } = await import("./route");
    const res = await DELETE(makeRequest(), { params: Promise.resolve({ id: "t-1", memberId: "m-1" }) });
    expect(res).toBeInstanceOf(Response);
    expect(res.status).toBe(401);
  });
});
