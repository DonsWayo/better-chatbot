import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const { getSessionMock, archiveRepositoryMock } = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  archiveRepositoryMock: {
    getArchiveById: vi.fn(),
    getArchiveItems: vi.fn(),
    updateArchive: vi.fn(),
    deleteArchive: vi.fn(),
  },
}));

vi.mock("auth/server", () => ({ getSession: getSessionMock }));
vi.mock("lib/db/repository", () => ({
  archiveRepository: archiveRepositoryMock,
}));

import { GET, PUT, DELETE } from "./route";

const makeContext = (id: string) => ({ params: Promise.resolve({ id }) });
const makeRequest = (body: unknown, method = "PUT") =>
  new Request("http://localhost", {
    method,
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });

const ARCHIVE = { id: "arch-1", name: "My Archive", userId: "user-1" };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/archive/[id]", () => {
  it("returns 401 when no session", async () => {
    getSessionMock.mockResolvedValue(null);
    const res = await GET(new Request("http://x"), makeContext("arch-1"));
    expect(res.status).toBe(401);
  });

  it("returns 404 when archive not found", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    archiveRepositoryMock.getArchiveById.mockResolvedValue(null);
    const res = await GET(new Request("http://x"), makeContext("arch-1"));
    expect(res.status).toBe(404);
  });

  it("returns 403 when user does not own archive", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-2" } });
    archiveRepositoryMock.getArchiveById.mockResolvedValue(ARCHIVE);
    const res = await GET(new Request("http://x"), makeContext("arch-1"));
    expect(res.status).toBe(403);
  });

  it("returns archive with items for owner", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    archiveRepositoryMock.getArchiveById.mockResolvedValue(ARCHIVE);
    archiveRepositoryMock.getArchiveItems.mockResolvedValue([{ id: "item-1" }]);
    const res = await GET(new Request("http://x"), makeContext("arch-1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe("arch-1");
    expect(body.items).toHaveLength(1);
  });

  it("returns 500 on repository error", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    archiveRepositoryMock.getArchiveById.mockRejectedValue(new Error("DB fail"));
    const res = await GET(new Request("http://x"), makeContext("arch-1"));
    expect(res.status).toBe(500);
  });
});

describe("PUT /api/archive/[id]", () => {
  it("returns 401 when no session", async () => {
    getSessionMock.mockResolvedValue(null);
    const res = await PUT(makeRequest({ name: "New Name" }), makeContext("arch-1"));
    expect(res.status).toBe(401);
  });

  it("returns 404 when archive not found", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    archiveRepositoryMock.getArchiveById.mockResolvedValue(null);
    const res = await PUT(makeRequest({ name: "New Name" }), makeContext("arch-1"));
    expect(res.status).toBe(404);
  });

  it("returns 403 when user does not own archive", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-2" } });
    archiveRepositoryMock.getArchiveById.mockResolvedValue(ARCHIVE);
    const res = await PUT(makeRequest({ name: "New Name" }), makeContext("arch-1"));
    expect(res.status).toBe(403);
  });

  it("returns 400 on invalid body (empty name string)", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    archiveRepositoryMock.getArchiveById.mockResolvedValue(ARCHIVE);
    const res = await PUT(makeRequest({ name: "" }), makeContext("arch-1"));
    expect(res.status).toBe(400);
  });

  it("returns 200 with updated archive on success", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    archiveRepositoryMock.getArchiveById.mockResolvedValue(ARCHIVE);
    const updated = { ...ARCHIVE, name: "Updated" };
    archiveRepositoryMock.updateArchive.mockResolvedValue(updated);
    const res = await PUT(makeRequest({ name: "Updated" }), makeContext("arch-1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe("Updated");
  });

  it("calls updateArchive with the archive id and new data", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    archiveRepositoryMock.getArchiveById.mockResolvedValue(ARCHIVE);
    archiveRepositoryMock.updateArchive.mockResolvedValue(ARCHIVE);
    await PUT(makeRequest({ name: "Renamed", description: "Desc" }), makeContext("arch-1"));
    expect(archiveRepositoryMock.updateArchive).toHaveBeenCalledWith(
      "arch-1",
      expect.objectContaining({ name: "Renamed", description: "Desc" }),
    );
  });
});

describe("DELETE /api/archive/[id]", () => {
  it("returns 401 when no session", async () => {
    getSessionMock.mockResolvedValue(null);
    const res = await DELETE(new Request("http://x"), makeContext("arch-1"));
    expect(res.status).toBe(401);
  });

  it("returns 404 when archive not found", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    archiveRepositoryMock.getArchiveById.mockResolvedValue(null);
    const res = await DELETE(new Request("http://x"), makeContext("arch-1"));
    expect(res.status).toBe(404);
  });

  it("returns 403 when user does not own archive", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-2" } });
    archiveRepositoryMock.getArchiveById.mockResolvedValue(ARCHIVE);
    const res = await DELETE(new Request("http://x"), makeContext("arch-1"));
    expect(res.status).toBe(403);
  });

  it("deletes and returns success for owner", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    archiveRepositoryMock.getArchiveById.mockResolvedValue(ARCHIVE);
    archiveRepositoryMock.deleteArchive.mockResolvedValue(undefined);
    const res = await DELETE(new Request("http://x"), makeContext("arch-1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it("calls deleteArchive with the archive id", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    archiveRepositoryMock.getArchiveById.mockResolvedValue(ARCHIVE);
    archiveRepositoryMock.deleteArchive.mockResolvedValue(undefined);
    await DELETE(new Request("http://x"), makeContext("arch-abc"));
    expect(archiveRepositoryMock.deleteArchive).toHaveBeenCalledWith("arch-abc");
  });

  it("returns 500 on repository error", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    archiveRepositoryMock.getArchiveById.mockRejectedValue(new Error("DB fail"));
    const res = await DELETE(new Request("http://x"), makeContext("arch-1"));
    expect(res.status).toBe(500);
  });
});
