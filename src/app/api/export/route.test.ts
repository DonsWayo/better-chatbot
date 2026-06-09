import { describe, it, expect, vi, beforeEach } from "vitest";

const { getSessionMock, selectSummaryByExporterIdMock } = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  selectSummaryByExporterIdMock: vi.fn(),
}));

vi.mock("auth/server", () => ({ getSession: getSessionMock }));
vi.mock("lib/db/repository", () => ({
  chatExportRepository: {
    selectSummaryByExporterId: selectSummaryByExporterIdMock,
  },
}));

describe("GET /api/export", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns 401 when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns empty list when user has no exports", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    selectSummaryByExporterIdMock.mockResolvedValueOnce([]);
    const { GET } = await import("./route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(0);
  });

  it("returns list of exports for authenticated user", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    const EXPORTS = [{ id: "ex-1", threadId: "t-1" }];
    selectSummaryByExporterIdMock.mockResolvedValueOnce(EXPORTS);
    const { GET } = await import("./route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].id).toBe("ex-1");
  });
});
