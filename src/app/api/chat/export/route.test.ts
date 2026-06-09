import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  getSessionMock,
  checkAccessMock,
  exportChatMock,
} = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  checkAccessMock: vi.fn(),
  exportChatMock: vi.fn(),
}));

vi.mock("auth/auth-instance", () => ({ getSession: getSessionMock }));
vi.mock("lib/db/repository", () => ({
  chatExportRepository: { exportChat: exportChatMock },
  chatRepository: { checkAccess: checkAccessMock },
}));
vi.mock("app-types/chat-export", () => ({
  ChatExportByThreadIdSchema: {
    parse: (b: unknown) => b,
  },
}));

function makeRequest(body?: unknown): Request {
  return { json: () => Promise.resolve(body) } as unknown as Request;
}

describe("POST /api/chat/export", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns 401 when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ threadId: "t-1" }));
    expect(res.status).toBe(401);
  });

  it("returns 401 when no access to thread", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    checkAccessMock.mockResolvedValueOnce(false);
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ threadId: "t-1" }));
    expect(res.status).toBe(401);
  });

  it("exports chat and returns success message", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    checkAccessMock.mockResolvedValueOnce(true);
    exportChatMock.mockResolvedValueOnce(undefined);
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ threadId: "t-1" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.message).toContain("exported");
    expect(exportChatMock).toHaveBeenCalledWith(
      expect.objectContaining({ threadId: "t-1", exporterId: "u1" }),
    );
  });

  it("never calls exportChat when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    await POST(makeRequest({ threadId: "t-1" }));
    expect(exportChatMock).not.toHaveBeenCalled();
  });

  it("never calls exportChat when access is denied", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    checkAccessMock.mockResolvedValueOnce(false);
    const { POST } = await import("./route");
    await POST(makeRequest({ threadId: "t-1" }));
    expect(exportChatMock).not.toHaveBeenCalled();
  });

  it("calls checkAccess with threadId and userId", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-abc" } });
    checkAccessMock.mockResolvedValueOnce(true);
    exportChatMock.mockResolvedValueOnce(undefined);
    const { POST } = await import("./route");
    await POST(makeRequest({ threadId: "thread-xyz" }));
    expect(checkAccessMock).toHaveBeenCalledWith("thread-xyz", "user-abc");
  });

  it("passes expiresAt to exportChat when provided", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u2" } });
    checkAccessMock.mockResolvedValueOnce(true);
    exportChatMock.mockResolvedValueOnce(undefined);
    const expiresAt = new Date("2026-12-31").toISOString();
    const { POST } = await import("./route");
    await POST(makeRequest({ threadId: "t-2", expiresAt }));
    expect(exportChatMock).toHaveBeenCalledWith(
      expect.objectContaining({ threadId: "t-2", exporterId: "u2", expiresAt }),
    );
  });
});
