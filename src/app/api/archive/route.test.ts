import { describe, it, expect, vi, beforeEach } from "vitest";

const { getSessionMock, getArchivesByUserIdMock, createArchiveMock } = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  getArchivesByUserIdMock: vi.fn(),
  createArchiveMock: vi.fn(),
}));

vi.mock("auth/server", () => ({ getSession: getSessionMock }));
vi.mock("lib/db/repository", () => ({
  archiveRepository: {
    getArchivesByUserId: getArchivesByUserIdMock,
    createArchive: createArchiveMock,
  },
}));
vi.mock("app-types/archive", () => ({
  ArchiveCreateSchema: { parse: (b: unknown) => b },
}));

function makeRequest(body?: unknown): Request {
  return { json: () => Promise.resolve(body) } as unknown as Request;
}

describe("GET /api/archive", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns 401 when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("never calls getArchivesByUserId when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    await GET();
    expect(getArchivesByUserIdMock).not.toHaveBeenCalled();
  });

  it("returns archives for authenticated user", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    getArchivesByUserIdMock.mockResolvedValueOnce([{ id: "a-1", name: "Archive 1" }]);
    const { GET } = await import("./route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].id).toBe("a-1");
  });

  it("passes userId to getArchivesByUserId", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-xyz-123" } });
    getArchivesByUserIdMock.mockResolvedValueOnce([]);
    const { GET } = await import("./route");
    await GET();
    expect(getArchivesByUserIdMock).toHaveBeenCalledWith("user-xyz-123");
  });

  it("returns empty array when user has no archives", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u2" } });
    getArchivesByUserIdMock.mockResolvedValueOnce([]);
    const { GET } = await import("./route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual([]);
  });

  it("returns 500 when repository throws", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    getArchivesByUserIdMock.mockRejectedValueOnce(new Error("DB down"));
    const { GET } = await import("./route");
    const res = await GET();
    expect(res.status).toBe(500);
  });
});

describe("POST /api/archive", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns 401 when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ name: "My Archive" }));
    expect(res.status).toBe(401);
  });

  it("never calls createArchive when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    await POST(makeRequest({ name: "My Archive" }));
    expect(createArchiveMock).not.toHaveBeenCalled();
  });

  it("creates archive and returns it", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    const ARCHIVE = { id: "a-new", name: "My Archive", userId: "u1" };
    createArchiveMock.mockResolvedValueOnce(ARCHIVE);
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ name: "My Archive" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe("a-new");
    expect(createArchiveMock).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "u1", name: "My Archive" }),
    );
  });

  it("returns 500 when createArchive throws non-Zod error", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    createArchiveMock.mockRejectedValueOnce(new Error("DB error"));
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ name: "My Archive" }));
    expect(res.status).toBe(500);
  });
});
