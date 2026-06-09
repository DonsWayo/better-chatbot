import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

const { getSessionMock, dbSelectMock, getTeamWithMembersMock, addTeamMemberMock } = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  dbSelectMock: vi.fn(),
  getTeamWithMembersMock: vi.fn(),
  addTeamMemberMock: vi.fn(),
}));

vi.mock("lib/auth/server", () => ({ getSession: getSessionMock }));
vi.mock("lib/admin/teams", () => ({
  getTeamWithMembers: getTeamWithMembersMock,
  addTeamMember: addTeamMemberMock,
}));

const TEAM = { id: "t-1" };
const MEMBER_ROW = {
  memberId: "mem-1",
  userId: "u-1",
  userName: "Alice",
  userEmail: "alice@example.com",
  role: "member",
  joinedAt: new Date().toISOString(),
};

// DB select chain for team lookup
const dbSelectWhereMock = vi.fn().mockResolvedValue([TEAM]);
const dbSelectFromMock = vi.fn().mockReturnValue({ where: dbSelectWhereMock });
dbSelectMock.mockReturnValue({ from: dbSelectFromMock });

vi.mock("lib/db/pg/db.pg", () => ({
  pgDb: { select: dbSelectMock },
}));
vi.mock("lib/db/pg/schema.pg", () => ({
  AsafeTeamTable: { id: "id" },
  UserTable: { id: "id", email: "email" },
}));
vi.mock("drizzle-orm", () => ({
  eq: vi.fn((_a: unknown, _b: unknown) => ({})),
}));

function makeRequest(body?: unknown): NextRequest {
  return { json: () => Promise.resolve(body) } as unknown as NextRequest;
}

describe("GET /api/admin/teams/[id]/members", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns 401 when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), { params: Promise.resolve({ id: "t-1" }) });
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-admin", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1", role: "user" } });
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), { params: Promise.resolve({ id: "t-1" }) });
    expect(res.status).toBe(403);
  });

  it("returns 404 when team not found", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "a1", role: "admin" } });
    getTeamWithMembersMock.mockResolvedValueOnce(null);
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), { params: Promise.resolve({ id: "missing" }) });
    expect(res.status).toBe(404);
  });

  it("returns members list", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "a1", role: "admin" } });
    getTeamWithMembersMock.mockResolvedValueOnce({ id: "t-1", members: [MEMBER_ROW] });
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), { params: Promise.resolve({ id: "t-1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.members).toHaveLength(1);
    expect(body.members[0].email).toBe("alice@example.com");
  });
});

describe("POST /api/admin/teams/[id]/members", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns 401 when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ email: "alice@example.com" }), { params: Promise.resolve({ id: "t-1" }) });
    expect(res.status).toBe(401);
  });

  it("returns 400 when neither email nor userId provided", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "a1", role: "admin" } });
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ role: "member" }), { params: Promise.resolve({ id: "t-1" }) });
    expect(res.status).toBe(400);
  });

  it("returns 404 when team not found", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "a1", role: "admin" } });
    dbSelectWhereMock.mockResolvedValueOnce([]);
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ userId: "c7d1e6f1-1234-4abc-8def-000000000099", role: "member" }), { params: Promise.resolve({ id: "missing" }) });
    expect(res.status).toBe(404);
  });

  it("resolves email to userId and adds member", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "a1", role: "admin" } });
    // First select: team lookup → found
    // Second select: user by email → found
    let callCount = 0;
    dbSelectMock.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return { from: () => ({ where: () => Promise.resolve([TEAM]) }) };
      }
      return { from: () => ({ where: () => Promise.resolve([{ id: "u-99" }]) }) };
    });
    addTeamMemberMock.mockResolvedValueOnce(undefined);
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ email: "alice@example.com", role: "editor" }), { params: Promise.resolve({ id: "t-1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(addTeamMemberMock).toHaveBeenCalledWith("t-1", "u-99", "editor");
  });
});

describe("GET /api/admin/teams/[id]/members — additional", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("401 body has error field", async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), { params: Promise.resolve({ id: "t-1" }) });
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("403 body has error field", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1", role: "user" } });
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), { params: Promise.resolve({ id: "t-1" }) });
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("never calls getTeamWithMembers when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    await GET(makeRequest(), { params: Promise.resolve({ id: "t-1" }) });
    expect(getTeamWithMembersMock).not.toHaveBeenCalled();
  });

  it("never calls getTeamWithMembers for non-admin", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1", role: "user" } });
    const { GET } = await import("./route");
    await GET(makeRequest(), { params: Promise.resolve({ id: "t-1" }) });
    expect(getTeamWithMembersMock).not.toHaveBeenCalled();
  });

  it("getSession called exactly once per GET", async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    await GET(makeRequest(), { params: Promise.resolve({ id: "t-1" }) });
    expect(getSessionMock).toHaveBeenCalledTimes(1);
  });

  it("200 body members is an array", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "a1", role: "admin" } });
    getTeamWithMembersMock.mockResolvedValueOnce({ id: "t-1", members: [MEMBER_ROW] });
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), { params: Promise.resolve({ id: "t-1" }) });
    const body = await res.json();
    expect(Array.isArray(body.members)).toBe(true);
  });
});

describe("POST /api/admin/teams/[id]/members — additional", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns 403 for non-admin", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1", role: "user" } });
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ email: "alice@example.com" }), { params: Promise.resolve({ id: "t-1" }) });
    expect(res.status).toBe(403);
  });

  it("401 body has error field", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ email: "alice@example.com" }), { params: Promise.resolve({ id: "t-1" }) });
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("403 body has error field", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1", role: "user" } });
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ email: "alice@example.com" }), { params: Promise.resolve({ id: "t-1" }) });
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("never calls addTeamMember when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    await POST(makeRequest({ email: "alice@example.com" }), { params: Promise.resolve({ id: "t-1" }) });
    expect(addTeamMemberMock).not.toHaveBeenCalled();
  });

  it("never calls addTeamMember for non-admin", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1", role: "user" } });
    const { POST } = await import("./route");
    await POST(makeRequest({ email: "alice@example.com" }), { params: Promise.resolve({ id: "t-1" }) });
    expect(addTeamMemberMock).not.toHaveBeenCalled();
  });

  it("getSession called exactly once per POST", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    await POST(makeRequest({ email: "alice@example.com" }), { params: Promise.resolve({ id: "t-1" }) });
    expect(getSessionMock).toHaveBeenCalledTimes(1);
  });
});

describe("GET /api/admin/teams/[id]/members — response shape", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("response is always a Response instance for 401", async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), { params: Promise.resolve({ id: "t-1" }) });
    expect(res).toBeInstanceOf(Response);
  });

  it("response is always a Response instance for 200", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "a1", role: "admin" } });
    getTeamWithMembersMock.mockResolvedValueOnce({ id: "t-1", members: [MEMBER_ROW] });
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), { params: Promise.resolve({ id: "t-1" }) });
    expect(res).toBeInstanceOf(Response);
  });

  it("POST response is always a Response instance for 401", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ email: "alice@example.com" }), { params: Promise.resolve({ id: "t-1" }) });
    expect(res).toBeInstanceOf(Response);
  });

  it("200 body has members property", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "a1", role: "admin" } });
    getTeamWithMembersMock.mockResolvedValueOnce({ id: "t-1", members: [] });
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), { params: Promise.resolve({ id: "t-1" }) });
    const body = await res.json();
    expect(body).toHaveProperty("members");
  });
});

describe("POST /api/admin/teams/[id]/members — response shape", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    getSessionMock.mockResolvedValue({ user: { id: "a1", role: "admin" } });
    dbSelectWhereMock.mockResolvedValue([TEAM]);
    addTeamMemberMock.mockResolvedValue({ memberId: "new-mem-1" });
  });

  it("returns a Response instance for 401", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ email: "alice@example.com" }), { params: Promise.resolve({ id: "t-1" }) });
    expect(res).toBeInstanceOf(Response);
  });

  it("returns a Response instance for 200", async () => {
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ email: "alice@example.com" }), { params: Promise.resolve({ id: "t-1" }) });
    expect(res).toBeInstanceOf(Response);
  });

  it("addTeamMember called exactly once on successful POST", async () => {
    const { POST } = await import("./route");
    await POST(makeRequest({ email: "alice@example.com" }), { params: Promise.resolve({ id: "t-1" }) });
    expect(addTeamMemberMock).toHaveBeenCalledTimes(1);
  });

  it("addTeamMember not called when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    await POST(makeRequest({ email: "alice@example.com" }), { params: Promise.resolve({ id: "t-1" }) });
    expect(addTeamMemberMock).not.toHaveBeenCalled();
  });
});

describe("GET and POST /api/admin/teams/[id]/members — call count invariants", () => {
  beforeEach(() => { vi.clearAllMocks(); vi.resetModules(); });

  it("getSession called exactly once per GET", async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    await GET(makeRequest(), { params: Promise.resolve({ id: "t-1" }) });
    expect(getSessionMock).toHaveBeenCalledTimes(1);
  });

  it("getTeamWithMembers not called when GET unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    await GET(makeRequest(), { params: Promise.resolve({ id: "t-1" }) });
    expect(getTeamWithMembersMock).not.toHaveBeenCalled();
  });

  it("GET returns 401 Response when session is null", async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), { params: Promise.resolve({ id: "t-1" }) });
    expect(res).toBeInstanceOf(Response);
    expect(res.status).toBe(401);
  });

  it("POST returns 401 Response when session is null", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ email: "x@test.com" }), { params: Promise.resolve({ id: "t-1" }) });
    expect(res).toBeInstanceOf(Response);
    expect(res.status).toBe(401);
  });
});
