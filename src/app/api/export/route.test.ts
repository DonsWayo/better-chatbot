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

  it("never calls repository when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    await GET();
    expect(selectSummaryByExporterIdMock).not.toHaveBeenCalled();
  });

  it("returns 200 for authenticated user", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    selectSummaryByExporterIdMock.mockResolvedValueOnce([]);
    const { GET } = await import("./route");
    const res = await GET();
    expect(res.status).toBe(200);
  });

  it("returns empty list when user has no exports", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    selectSummaryByExporterIdMock.mockResolvedValueOnce([]);
    const { GET } = await import("./route");
    const res = await GET();
    const body = await res.json();
    expect(body).toHaveLength(0);
  });

  it("returns list of exports for authenticated user", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    const EXPORTS = [{ id: "ex-1", threadId: "t-1" }];
    selectSummaryByExporterIdMock.mockResolvedValueOnce(EXPORTS);
    const { GET } = await import("./route");
    const res = await GET();
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].id).toBe("ex-1");
  });

  it("passes correct userId to repository", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-xyz-789" } });
    selectSummaryByExporterIdMock.mockResolvedValueOnce([]);
    const { GET } = await import("./route");
    await GET();
    expect(selectSummaryByExporterIdMock).toHaveBeenCalledWith("user-xyz-789");
  });

  it("preserves export fields in response", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    const exp = { id: "ex-1", threadId: "t-99", exportedAt: "2025-06-01", title: "Analysis" };
    selectSummaryByExporterIdMock.mockResolvedValueOnce([exp]);
    const { GET } = await import("./route");
    const res = await GET();
    const body = await res.json();
    expect(body[0].id).toBe("ex-1");
    expect(body[0].threadId).toBe("t-99");
    expect(body[0].title).toBe("Analysis");
  });

  it("returns multiple exports", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    const EXPORTS = Array.from({ length: 5 }, (_, i) => ({ id: `ex-${i}`, threadId: `t-${i}` }));
    selectSummaryByExporterIdMock.mockResolvedValueOnce(EXPORTS);
    const { GET } = await import("./route");
    const res = await GET();
    const body = await res.json();
    expect(body).toHaveLength(5);
  });

  it("returns 500 when repository throws", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    selectSummaryByExporterIdMock.mockRejectedValueOnce(new Error("DB connection lost"));
    const { GET } = await import("./route");
    const res = await GET();
    expect(res.status).toBe(500);
  });

  it("error body contains error message on 500", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    selectSummaryByExporterIdMock.mockRejectedValueOnce(new Error("connection timeout"));
    const { GET } = await import("./route");
    const res = await GET();
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });
});
