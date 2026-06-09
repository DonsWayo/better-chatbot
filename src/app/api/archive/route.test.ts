import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const { getSessionMock, archiveRepositoryMock } = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  archiveRepositoryMock: {
    getArchivesByUserId: vi.fn(),
    createArchive: vi.fn(),
  },
}));

vi.mock("auth/server", () => ({ getSession: getSessionMock }));
vi.mock("lib/db/repository", () => ({
  archiveRepository: archiveRepositoryMock,
}));

import { GET, POST } from "./route";

const makeRequest = (body: unknown) =>
  new Request("http://localhost", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/archive", () => {
  it("returns 401 when session is null", async () => {
    getSessionMock.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns 401 when user id is missing", async () => {
    getSessionMock.mockResolvedValue({ user: {} });
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns 200 with archives for authenticated user", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    archiveRepositoryMock.getArchivesByUserId.mockResolvedValue([
      { id: "arch-1", name: "My Archive" },
    ]);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
  });

  it("calls repository with the correct userId", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-99" } });
    archiveRepositoryMock.getArchivesByUserId.mockResolvedValue([]);
    await GET();
    expect(archiveRepositoryMock.getArchivesByUserId).toHaveBeenCalledWith("user-99");
  });

  it("returns empty array when no archives", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    archiveRepositoryMock.getArchivesByUserId.mockResolvedValue([]);
    const res = await GET();
    const body = await res.json();
    expect(body).toEqual([]);
  });

  it("returns 500 on repository error", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    archiveRepositoryMock.getArchivesByUserId.mockRejectedValue(new Error("DB fail"));
    const res = await GET();
    expect(res.status).toBe(500);
  });
});

describe("POST /api/archive", () => {
  it("returns 401 when session is null", async () => {
    getSessionMock.mockResolvedValue(null);
    const res = await POST(makeRequest({ name: "New Archive" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 on missing name", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it("creates archive and returns it", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    const created = { id: "arch-1", name: "Test Archive", userId: "user-1" };
    archiveRepositoryMock.createArchive.mockResolvedValue(created);
    const res = await POST(makeRequest({ name: "Test Archive" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe("arch-1");
  });

  it("calls createArchive with correct data", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-42" } });
    archiveRepositoryMock.createArchive.mockResolvedValue({ id: "arch-1" });
    await POST(makeRequest({ name: "My Archive", description: "A description" }));
    expect(archiveRepositoryMock.createArchive).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "My Archive",
        description: "A description",
        userId: "user-42",
      }),
    );
  });

  it("passes null description when not provided", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    archiveRepositoryMock.createArchive.mockResolvedValue({ id: "arch-1" });
    await POST(makeRequest({ name: "No Description" }));
    expect(archiveRepositoryMock.createArchive).toHaveBeenCalledWith(
      expect.objectContaining({ description: null }),
    );
  });

  it("returns 500 on repository error", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    archiveRepositoryMock.createArchive.mockRejectedValue(new Error("DB fail"));
    const res = await POST(makeRequest({ name: "Test" }));
    expect(res.status).toBe(500);
  });
});
