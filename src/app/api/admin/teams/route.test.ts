import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

const { getSessionMock, getAdminTeamsMock, createTeamMock } = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  getAdminTeamsMock: vi.fn(),
  createTeamMock: vi.fn(),
}));

vi.mock("lib/auth/server", () => ({ getSession: getSessionMock }));
vi.mock("lib/admin/teams", () => ({
  getAdminTeams: getAdminTeamsMock,
  createTeam: createTeamMock,
}));

function makeRequest(body?: unknown): NextRequest {
  return { json: () => Promise.resolve(body) } as unknown as NextRequest;
}

describe("GET /api/admin/teams", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns 401 when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-admin", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1", role: "user" } });
    const { GET } = await import("./route");
    const res = await GET(makeRequest());
    expect(res.status).toBe(403);
  });

  it("returns teams list for admin", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "a1", role: "admin" } });
    const TEAMS = [{ id: "t-1", name: "Alpha", memberCount: 2 }];
    getAdminTeamsMock.mockResolvedValueOnce(TEAMS);
    const { GET } = await import("./route");
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.teams).toEqual(TEAMS);
  });
});

describe("POST /api/admin/teams", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns 401 when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ name: "Alpha" }));
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-admin", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1", role: "user" } });
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ name: "Alpha" }));
    expect(res.status).toBe(403);
  });

  it("returns 400 when name is missing", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "a1", role: "admin" } });
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ description: "no name here" }));
    expect(res.status).toBe(400);
  });

  it("creates team and returns it", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "a1", role: "admin" } });
    const TEAM = { id: "t-new", name: "Beta", description: "A fine team" };
    createTeamMock.mockResolvedValueOnce(TEAM);
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ name: "Beta", description: "A fine team" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.team).toEqual(TEAM);
    expect(createTeamMock).toHaveBeenCalledWith("Beta", "A fine team");
  });

  it("returns 403 for editor role", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "e1", role: "editor" } });
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ name: "Gamma" }));
    expect(res.status).toBe(403);
  });

  it("never calls createTeam when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    await POST(makeRequest({ name: "Delta" }));
    expect(createTeamMock).not.toHaveBeenCalled();
  });

  it("never calls createTeam for non-admin", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1", role: "user" } });
    const { POST } = await import("./route");
    await POST(makeRequest({ name: "Epsilon" }));
    expect(createTeamMock).not.toHaveBeenCalled();
  });
});

describe("GET /api/admin/teams — guard chain", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("never calls getAdminTeams when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    await GET(makeRequest());
    expect(getAdminTeamsMock).not.toHaveBeenCalled();
  });

  it("never calls getAdminTeams for non-admin", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1", role: "user" } });
    const { GET } = await import("./route");
    await GET(makeRequest());
    expect(getAdminTeamsMock).not.toHaveBeenCalled();
  });

  it("returns 403 for editor", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "e1", role: "editor" } });
    const { GET } = await import("./route");
    const res = await GET(makeRequest());
    expect(res.status).toBe(403);
  });

  it("GET 401 body has error field", async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    const res = await GET(makeRequest());
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("GET 403 body has error field", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1", role: "user" } });
    const { GET } = await import("./route");
    const res = await GET(makeRequest());
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("POST 401 body has error field", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ name: "Zeta" }));
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("POST 403 body has error field", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1", role: "user" } });
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ name: "Eta" }));
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });
});
