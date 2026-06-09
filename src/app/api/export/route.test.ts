import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const { getSessionMock, chatExportRepositoryMock } = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  chatExportRepositoryMock: {
    selectSummaryByExporterId: vi.fn(),
  },
}));

vi.mock("auth/server", () => ({ getSession: getSessionMock }));
vi.mock("lib/db/repository", () => ({
  chatExportRepository: chatExportRepositoryMock,
}));

import { GET } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/export", () => {
  it("returns 401 when session is null", async () => {
    getSessionMock.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns 401 error body when session is null", async () => {
    getSessionMock.mockResolvedValue(null);
    const res = await GET();
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 401 when session has no user", async () => {
    getSessionMock.mockResolvedValue({ user: null });
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns 401 when session user has no id", async () => {
    getSessionMock.mockResolvedValue({ user: {} });
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns 200 with exports for authenticated user", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    chatExportRepositoryMock.selectSummaryByExporterId.mockResolvedValue([
      { id: "exp-1", title: "Test Export" },
    ]);
    const res = await GET();
    expect(res.status).toBe(200);
  });

  it("returns export list in response body", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    const exports = [{ id: "exp-1" }, { id: "exp-2" }];
    chatExportRepositoryMock.selectSummaryByExporterId.mockResolvedValue(exports);
    const res = await GET();
    const body = await res.json();
    expect(body).toEqual(exports);
  });

  it("calls repository with the authenticated user id", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-42" } });
    chatExportRepositoryMock.selectSummaryByExporterId.mockResolvedValue([]);
    await GET();
    expect(chatExportRepositoryMock.selectSummaryByExporterId).toHaveBeenCalledWith("user-42");
  });

  it("returns 500 when repository throws", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    chatExportRepositoryMock.selectSummaryByExporterId.mockRejectedValue(
      new Error("Database error"),
    );
    const res = await GET();
    expect(res.status).toBe(500);
  });

  it("returns error message in 500 response body", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    chatExportRepositoryMock.selectSummaryByExporterId.mockRejectedValue(
      new Error("Connection refused"),
    );
    const res = await GET();
    const body = await res.json();
    expect(body.error).toBe("Connection refused");
  });

  it("returns empty array when no exports exist", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    chatExportRepositoryMock.selectSummaryByExporterId.mockResolvedValue([]);
    const res = await GET();
    const body = await res.json();
    expect(body).toEqual([]);
  });
});
