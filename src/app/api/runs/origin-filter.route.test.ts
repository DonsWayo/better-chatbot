// Tests for the ?origin= query param added to GET /api/runs (Agent Platform
// #26 — Triage "Recent routine runs"). The base behavior of the route is
// covered in route.test.ts; this file only exercises the filter seam.
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSessionMock, listSessionsForUserMock } = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  listSessionsForUserMock: vi.fn(),
}));

vi.mock("auth/server", () => ({ getSession: getSessionMock }));
vi.mock("lib/agent-platform/sessions", () => ({
  listSessionsForUser: listSessionsForUserMock,
}));

const SESSIONS = [
  { id: "s-1", originSurface: "web", status: "completed" },
  { id: "s-2", originSurface: "schedule", status: "running" },
  { id: "s-3", originSurface: "webhook", status: "completed" },
  { id: "s-4", originSurface: "schedule", status: "failed" },
];

function requestWith(query: string): Request {
  return new Request(`http://localhost/api/runs${query}`);
}

describe("GET /api/runs?origin=…", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated even with an origin param", async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    const res = await GET(requestWith("?origin=schedule"));
    expect(res.status).toBe(401);
    expect(listSessionsForUserMock).not.toHaveBeenCalled();
  });

  it("returns only sessions matching the requested origin", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    listSessionsForUserMock.mockResolvedValueOnce(SESSIONS);
    const { GET } = await import("./route");
    const res = await GET(requestWith("?origin=schedule"));
    const body = await res.json();
    expect(body.map((s: { id: string }) => s.id)).toEqual(["s-2", "s-4"]);
  });

  it("scans a deeper window (limit 200) when filtering", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    listSessionsForUserMock.mockResolvedValueOnce(SESSIONS);
    const { GET } = await import("./route");
    await GET(requestWith("?origin=schedule"));
    expect(listSessionsForUserMock).toHaveBeenCalledWith("u1", { limit: 200 });
  });

  it("keeps the default behavior when no origin param is given", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    listSessionsForUserMock.mockResolvedValueOnce(SESSIONS);
    const { GET } = await import("./route");
    const res = await GET(requestWith(""));
    const body = await res.json();
    expect(listSessionsForUserMock).toHaveBeenCalledWith("u1", { limit: 30 });
    expect(body).toHaveLength(4);
  });

  it("returns an empty array when nothing matches the origin", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    listSessionsForUserMock.mockResolvedValueOnce(SESSIONS);
    const { GET } = await import("./route");
    const res = await GET(requestWith("?origin=desktop"));
    await expect(res.json()).resolves.toEqual([]);
  });

  it("caps filtered results at the default page size (30)", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    const many = Array.from({ length: 50 }, (_, i) => ({
      id: `s-${i}`,
      originSurface: "schedule",
    }));
    listSessionsForUserMock.mockResolvedValueOnce(many);
    const { GET } = await import("./route");
    const res = await GET(requestWith("?origin=schedule"));
    const body = await res.json();
    expect(body).toHaveLength(30);
  });
});
