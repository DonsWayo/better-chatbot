import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

const { getSessionMock, chatExportRepositoryMock } = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  chatExportRepositoryMock: {
    checkAccess: vi.fn(),
    deleteById: vi.fn(),
  },
}));

vi.mock("auth/server", () => ({ getSession: getSessionMock }));
vi.mock("lib/db/repository", () => ({
  chatExportRepository: chatExportRepositoryMock,
}));

import { DELETE } from "./route";

const makeContext = (id: string) => ({
  params: Promise.resolve({ id }),
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("DELETE /api/export/[id]", () => {
  it("returns 401 when session is null", async () => {
    getSessionMock.mockResolvedValue(null);
    const res = await DELETE(new NextRequest("http://localhost"), makeContext("exp-1"));
    expect(res.status).toBe(401);
  });

  it("returns Unauthorized in body when no session", async () => {
    getSessionMock.mockResolvedValue(null);
    const res = await DELETE(new NextRequest("http://localhost"), makeContext("exp-1"));
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 401 when session has no user id", async () => {
    getSessionMock.mockResolvedValue({ user: {} });
    const res = await DELETE(new NextRequest("http://localhost"), makeContext("exp-1"));
    expect(res.status).toBe(401);
  });

  it("returns 403 when user lacks access", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    chatExportRepositoryMock.checkAccess.mockResolvedValue(false);
    const res = await DELETE(new NextRequest("http://localhost"), makeContext("exp-1"));
    expect(res.status).toBe(403);
  });

  it("returns Forbidden in body when access denied", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    chatExportRepositoryMock.checkAccess.mockResolvedValue(false);
    const res = await DELETE(new NextRequest("http://localhost"), makeContext("exp-1"));
    const body = await res.json();
    expect(body.error).toBe("Forbidden");
  });

  it("returns 200 success when authorized and deleted", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    chatExportRepositoryMock.checkAccess.mockResolvedValue(true);
    chatExportRepositoryMock.deleteById.mockResolvedValue(undefined);
    const res = await DELETE(new NextRequest("http://localhost"), makeContext("exp-1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it("calls checkAccess with correct exportId and userId", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-99" } });
    chatExportRepositoryMock.checkAccess.mockResolvedValue(true);
    chatExportRepositoryMock.deleteById.mockResolvedValue(undefined);
    await DELETE(new NextRequest("http://localhost"), makeContext("exp-xyz"));
    expect(chatExportRepositoryMock.checkAccess).toHaveBeenCalledWith("exp-xyz", "user-99");
  });

  it("calls deleteById with the export id", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    chatExportRepositoryMock.checkAccess.mockResolvedValue(true);
    chatExportRepositoryMock.deleteById.mockResolvedValue(undefined);
    await DELETE(new NextRequest("http://localhost"), makeContext("exp-abc"));
    expect(chatExportRepositoryMock.deleteById).toHaveBeenCalledWith("exp-abc");
  });

  it("does not call deleteById when access is denied", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    chatExportRepositoryMock.checkAccess.mockResolvedValue(false);
    await DELETE(new NextRequest("http://localhost"), makeContext("exp-1"));
    expect(chatExportRepositoryMock.deleteById).not.toHaveBeenCalled();
  });

  it("returns 500 on unexpected error", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    chatExportRepositoryMock.checkAccess.mockRejectedValue(new Error("DB failure"));
    const res = await DELETE(new NextRequest("http://localhost"), makeContext("exp-1"));
    expect(res.status).toBe(500);
  });

  it("includes error message in 500 body", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    chatExportRepositoryMock.checkAccess.mockRejectedValue(new Error("Connection lost"));
    const res = await DELETE(new NextRequest("http://localhost"), makeContext("exp-1"));
    const body = await res.json();
    expect(body.error).toBe("Connection lost");
  });
});
