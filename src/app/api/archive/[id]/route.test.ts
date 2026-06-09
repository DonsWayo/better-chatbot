import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  getSessionMock,
  getArchiveByIdMock,
  getArchiveItemsMock,
  updateArchiveMock,
  deleteArchiveMock,
} = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  getArchiveByIdMock: vi.fn(),
  getArchiveItemsMock: vi.fn(),
  updateArchiveMock: vi.fn(),
  deleteArchiveMock: vi.fn(),
}));

vi.mock("auth/server", () => ({ getSession: getSessionMock }));
vi.mock("lib/db/repository", () => ({
  archiveRepository: {
    getArchiveById: getArchiveByIdMock,
    getArchiveItems: getArchiveItemsMock,
    updateArchive: updateArchiveMock,
    deleteArchive: deleteArchiveMock,
  },
}));
vi.mock("app-types/archive", () => ({
  ArchiveUpdateSchema: { parse: (b: unknown) => b },
}));

const ARCHIVE = { id: "a-1", name: "Test Archive", userId: "u1" };

function makeRequest(body?: unknown): Request {
  return { json: () => Promise.resolve(body) } as unknown as Request;
}

describe("GET /api/archive/[id]", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns 401 when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), { params: Promise.resolve({ id: "a-1" }) });
    expect(res.status).toBe(401);
  });

  it("returns 404 when archive not found", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    getArchiveByIdMock.mockResolvedValueOnce(null);
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), { params: Promise.resolve({ id: "missing" }) });
    expect(res.status).toBe(404);
  });

  it("returns 403 when user does not own archive", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u2" } });
    getArchiveByIdMock.mockResolvedValueOnce(ARCHIVE);
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), { params: Promise.resolve({ id: "a-1" }) });
    expect(res.status).toBe(403);
  });

  it("returns archive with items", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    getArchiveByIdMock.mockResolvedValueOnce(ARCHIVE);
    getArchiveItemsMock.mockResolvedValueOnce([{ itemId: "item-1" }]);
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), { params: Promise.resolve({ id: "a-1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe("a-1");
    expect(body.items).toHaveLength(1);
  });
});

describe("PUT /api/archive/[id]", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns 401 when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { PUT } = await import("./route");
    const res = await PUT(makeRequest({ name: "New Name" }), { params: Promise.resolve({ id: "a-1" }) });
    expect(res.status).toBe(401);
  });

  it("returns 404 when archive not found", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    getArchiveByIdMock.mockResolvedValueOnce(null);
    const { PUT } = await import("./route");
    const res = await PUT(makeRequest({ name: "New Name" }), { params: Promise.resolve({ id: "missing" }) });
    expect(res.status).toBe(404);
  });

  it("updates archive and returns updated record", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    getArchiveByIdMock.mockResolvedValueOnce(ARCHIVE);
    const UPDATED = { ...ARCHIVE, name: "Renamed" };
    updateArchiveMock.mockResolvedValueOnce(UPDATED);
    const { PUT } = await import("./route");
    const res = await PUT(makeRequest({ name: "Renamed" }), { params: Promise.resolve({ id: "a-1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe("Renamed");
  });
});

describe("DELETE /api/archive/[id]", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns 401 when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { DELETE } = await import("./route");
    const res = await DELETE(makeRequest(), { params: Promise.resolve({ id: "a-1" }) });
    expect(res.status).toBe(401);
  });

  it("returns 404 when archive not found", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    getArchiveByIdMock.mockResolvedValueOnce(null);
    const { DELETE } = await import("./route");
    const res = await DELETE(makeRequest(), { params: Promise.resolve({ id: "missing" }) });
    expect(res.status).toBe(404);
  });

  it("deletes archive and returns success", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    getArchiveByIdMock.mockResolvedValueOnce(ARCHIVE);
    deleteArchiveMock.mockResolvedValueOnce(undefined);
    const { DELETE } = await import("./route");
    const res = await DELETE(makeRequest(), { params: Promise.resolve({ id: "a-1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(deleteArchiveMock).toHaveBeenCalledWith("a-1");
  });
});
