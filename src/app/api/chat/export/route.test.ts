import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const {
  getSessionMock,
  chatRepositoryMock,
  chatExportRepositoryMock,
} = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  chatRepositoryMock: { checkAccess: vi.fn() },
  chatExportRepositoryMock: { exportChat: vi.fn() },
}));

vi.mock("auth/auth-instance", () => ({ getSession: getSessionMock }));
vi.mock("lib/db/repository", () => ({
  chatRepository: chatRepositoryMock,
  chatExportRepository: chatExportRepositoryMock,
}));

import { POST } from "./route";

const makeRequest = (body: unknown) =>
  new Request("http://localhost/api/chat/export", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });

const VALID_BODY = { threadId: "thread-1" };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/chat/export", () => {
  it("returns 401 when no session", async () => {
    getSessionMock.mockResolvedValue(null);
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(401);
  });

  it("returns 401 when user lacks access to thread", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    chatRepositoryMock.checkAccess.mockResolvedValue(false);
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(401);
  });

  it("exports chat and returns success message when authorized", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    chatRepositoryMock.checkAccess.mockResolvedValue(true);
    chatExportRepositoryMock.exportChat.mockResolvedValue(undefined);
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.message).toMatch(/exported/i);
  });

  it("calls checkAccess with threadId and userId", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-42" } });
    chatRepositoryMock.checkAccess.mockResolvedValue(true);
    chatExportRepositoryMock.exportChat.mockResolvedValue(undefined);
    await POST(makeRequest({ threadId: "thread-abc" }));
    expect(chatRepositoryMock.checkAccess).toHaveBeenCalledWith(
      "thread-abc",
      "user-42",
    );
  });

  it("calls exportChat with threadId and userId from session", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-session" } });
    chatRepositoryMock.checkAccess.mockResolvedValue(true);
    chatExportRepositoryMock.exportChat.mockResolvedValue(undefined);
    await POST(makeRequest({ threadId: "thread-xyz" }));
    expect(chatExportRepositoryMock.exportChat).toHaveBeenCalledWith(
      expect.objectContaining({
        threadId: "thread-xyz",
        exporterId: "user-session",
      }),
    );
  });

  it("passes null expiresAt when explicitly null", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    chatRepositoryMock.checkAccess.mockResolvedValue(true);
    chatExportRepositoryMock.exportChat.mockResolvedValue(undefined);
    await POST(makeRequest({ threadId: "thread-1", expiresAt: null }));
    expect(chatExportRepositoryMock.exportChat).toHaveBeenCalledWith(
      expect.objectContaining({ expiresAt: undefined }),
    );
  });

  it("passes undefined expiresAt when not provided", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    chatRepositoryMock.checkAccess.mockResolvedValue(true);
    chatExportRepositoryMock.exportChat.mockResolvedValue(undefined);
    await POST(makeRequest({ threadId: "thread-1" }));
    expect(chatExportRepositoryMock.exportChat).toHaveBeenCalledWith(
      expect.objectContaining({ expiresAt: undefined }),
    );
  });
});
