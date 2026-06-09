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
});
