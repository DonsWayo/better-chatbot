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
});

describe("POST /api/archive", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns 401 when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ name: "My Archive" }));
    expect(res.status).toBe(401);
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
});
