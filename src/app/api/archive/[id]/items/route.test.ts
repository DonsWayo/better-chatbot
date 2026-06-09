import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  getSessionMock,
  getArchiveByIdMock,
  getArchiveItemsMock,
  addItemToArchiveMock,
} = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  getArchiveByIdMock: vi.fn(),
  getArchiveItemsMock: vi.fn(),
  addItemToArchiveMock: vi.fn(),
}));

vi.mock("auth/server", () => ({ getSession: getSessionMock }));
vi.mock("lib/db/repository", () => ({
  archiveRepository: {
    getArchiveById: getArchiveByIdMock,
    getArchiveItems: getArchiveItemsMock,
    addItemToArchive: addItemToArchiveMock,
  },
}));

const ARCHIVE = { id: "a-1", name: "My Archive", userId: "u1" };

function makeRequest(body?: unknown): Request {
  return { json: () => Promise.resolve(body) } as unknown as Request;
}

describe("GET /api/archive/[id]/items", () => {
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

  it("returns items for owned archive", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    getArchiveByIdMock.mockResolvedValueOnce(ARCHIVE);
    getArchiveItemsMock.mockResolvedValueOnce([{ itemId: "item-1" }, { itemId: "item-2" }]);
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), { params: Promise.resolve({ id: "a-1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(2);
  });
});

describe("POST /api/archive/[id]/items", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns 401 when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ itemId: "item-1" }), { params: Promise.resolve({ id: "a-1" }) });
    expect(res.status).toBe(401);
  });

  it("returns 404 when archive not found", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    getArchiveByIdMock.mockResolvedValueOnce(null);
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ itemId: "item-1" }), { params: Promise.resolve({ id: "missing" }) });
    expect(res.status).toBe(404);
  });

  it("adds item to archive and returns created item", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    getArchiveByIdMock.mockResolvedValueOnce(ARCHIVE);
    const ITEM = { id: "ai-1", archiveId: "a-1", itemId: "item-42" };
    addItemToArchiveMock.mockResolvedValueOnce(ITEM);
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ itemId: "item-42" }), { params: Promise.resolve({ id: "a-1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.itemId).toBe("item-42");
    expect(addItemToArchiveMock).toHaveBeenCalledWith("a-1", "item-42", "u1");
  });

  it("never calls addItemToArchive when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    await POST(makeRequest({ itemId: "item-1" }), { params: Promise.resolve({ id: "a-1" }) });
    expect(addItemToArchiveMock).not.toHaveBeenCalled();
  });

  it("never calls addItemToArchive when archive not found", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    getArchiveByIdMock.mockResolvedValueOnce(null);
    const { POST } = await import("./route");
    await POST(makeRequest({ itemId: "item-1" }), { params: Promise.resolve({ id: "a-1" }) });
    expect(addItemToArchiveMock).not.toHaveBeenCalled();
  });
});

describe("GET /api/archive/[id]/items — guard chains", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("never calls getArchiveItems when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    await GET(makeRequest(), { params: Promise.resolve({ id: "a-1" }) });
    expect(getArchiveItemsMock).not.toHaveBeenCalled();
  });

  it("never calls getArchiveItems when archive not found", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    getArchiveByIdMock.mockResolvedValueOnce(null);
    const { GET } = await import("./route");
    await GET(makeRequest(), { params: Promise.resolve({ id: "a-1" }) });
    expect(getArchiveItemsMock).not.toHaveBeenCalled();
  });

  it("returns empty array for archive with no items", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    getArchiveByIdMock.mockResolvedValueOnce(ARCHIVE);
    getArchiveItemsMock.mockResolvedValueOnce([]);
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), { params: Promise.resolve({ id: "a-1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(0);
  });
});
