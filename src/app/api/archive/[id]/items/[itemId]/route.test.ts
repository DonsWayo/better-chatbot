import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  getSessionMock,
  getArchiveByIdMock,
  getArchiveItemsMock,
  removeItemFromArchiveMock,
} = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  getArchiveByIdMock: vi.fn(),
  getArchiveItemsMock: vi.fn(),
  removeItemFromArchiveMock: vi.fn(),
}));

vi.mock("auth/server", () => ({ getSession: getSessionMock }));
vi.mock("lib/db/repository", () => ({
  archiveRepository: {
    getArchiveById: getArchiveByIdMock,
    getArchiveItems: getArchiveItemsMock,
    removeItemFromArchive: removeItemFromArchiveMock,
  },
}));

const ARCHIVE = { id: "a-1", name: "My Archive", userId: "u1" };

function makeRequest(): Request {
  return {} as unknown as Request;
}

describe("DELETE /api/archive/[id]/items/[itemId]", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns 401 when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { DELETE } = await import("./route");
    const res = await DELETE(makeRequest(), { params: Promise.resolve({ id: "a-1", itemId: "item-1" }) });
    expect(res.status).toBe(401);
  });

  it("returns 404 when archive not found", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    getArchiveByIdMock.mockResolvedValueOnce(null);
    const { DELETE } = await import("./route");
    const res = await DELETE(makeRequest(), { params: Promise.resolve({ id: "missing", itemId: "item-1" }) });
    expect(res.status).toBe(404);
  });

  it("returns 403 when user does not own the archive", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u2" } });
    getArchiveByIdMock.mockResolvedValueOnce(ARCHIVE);
    const { DELETE } = await import("./route");
    const res = await DELETE(makeRequest(), { params: Promise.resolve({ id: "a-1", itemId: "item-1" }) });
    expect(res.status).toBe(403);
  });

  it("returns 404 when item not in archive", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    getArchiveByIdMock.mockResolvedValueOnce(ARCHIVE);
    getArchiveItemsMock.mockResolvedValueOnce([{ itemId: "other-item" }]);
    const { DELETE } = await import("./route");
    const res = await DELETE(makeRequest(), { params: Promise.resolve({ id: "a-1", itemId: "item-1" }) });
    expect(res.status).toBe(404);
  });

  it("removes item and returns success", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    getArchiveByIdMock.mockResolvedValueOnce(ARCHIVE);
    getArchiveItemsMock.mockResolvedValueOnce([{ itemId: "item-1" }]);
    removeItemFromArchiveMock.mockResolvedValueOnce(undefined);
    const { DELETE } = await import("./route");
    const res = await DELETE(makeRequest(), { params: Promise.resolve({ id: "a-1", itemId: "item-1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(removeItemFromArchiveMock).toHaveBeenCalledWith("a-1", "item-1");
  });

  it("never calls removeItemFromArchive when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { DELETE } = await import("./route");
    await DELETE(makeRequest(), { params: Promise.resolve({ id: "a-1", itemId: "item-1" }) });
    expect(removeItemFromArchiveMock).not.toHaveBeenCalled();
  });

  it("never calls removeItemFromArchive when archive not found", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    getArchiveByIdMock.mockResolvedValueOnce(null);
    const { DELETE } = await import("./route");
    await DELETE(makeRequest(), { params: Promise.resolve({ id: "missing", itemId: "item-1" }) });
    expect(removeItemFromArchiveMock).not.toHaveBeenCalled();
  });

  it("never calls removeItemFromArchive when user does not own archive", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u2" } });
    getArchiveByIdMock.mockResolvedValueOnce(ARCHIVE);
    const { DELETE } = await import("./route");
    await DELETE(makeRequest(), { params: Promise.resolve({ id: "a-1", itemId: "item-1" }) });
    expect(removeItemFromArchiveMock).not.toHaveBeenCalled();
  });

  it("never calls removeItemFromArchive when item not in archive", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    getArchiveByIdMock.mockResolvedValueOnce(ARCHIVE);
    getArchiveItemsMock.mockResolvedValueOnce([{ itemId: "other-item" }]);
    const { DELETE } = await import("./route");
    await DELETE(makeRequest(), { params: Promise.resolve({ id: "a-1", itemId: "item-1" }) });
    expect(removeItemFromArchiveMock).not.toHaveBeenCalled();
  });

  it("401 body is text 'Unauthorized'", async () => {
    getSessionMock.mockResolvedValue(null);
    const { DELETE } = await import("./route");
    const res = await DELETE(makeRequest(), { params: Promise.resolve({ id: "a-1", itemId: "item-1" }) });
    expect(await res.text()).toBe("Unauthorized");
  });

  it("403 body is text 'Forbidden'", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u2" } });
    getArchiveByIdMock.mockResolvedValueOnce(ARCHIVE);
    const { DELETE } = await import("./route");
    const res = await DELETE(makeRequest(), { params: Promise.resolve({ id: "a-1", itemId: "item-1" }) });
    expect(await res.text()).toBe("Forbidden");
  });

  it("removeItemFromArchive called exactly once on success", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    getArchiveByIdMock.mockResolvedValueOnce(ARCHIVE);
    getArchiveItemsMock.mockResolvedValueOnce([{ itemId: "item-1" }]);
    removeItemFromArchiveMock.mockResolvedValueOnce(undefined);
    const { DELETE } = await import("./route");
    await DELETE(makeRequest(), { params: Promise.resolve({ id: "a-1", itemId: "item-1" }) });
    expect(removeItemFromArchiveMock).toHaveBeenCalledTimes(1);
  });
});

describe("DELETE /api/archive/[id]/items/[itemId] — additional", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("getSession called exactly once per DELETE", async () => {
    getSessionMock.mockResolvedValue(null);
    const { DELETE } = await import("./route");
    await DELETE(makeRequest(), { params: Promise.resolve({ id: "a-1", itemId: "item-1" }) });
    expect(getSessionMock).toHaveBeenCalledTimes(1);
  });

  it("never calls getArchiveById when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { DELETE } = await import("./route");
    await DELETE(makeRequest(), { params: Promise.resolve({ id: "a-1", itemId: "item-1" }) });
    expect(getArchiveByIdMock).not.toHaveBeenCalled();
  });

  it("200 body has success:true on valid removal", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    getArchiveByIdMock.mockResolvedValueOnce(ARCHIVE);
    getArchiveItemsMock.mockResolvedValueOnce([{ itemId: "item-x" }]);
    removeItemFromArchiveMock.mockResolvedValueOnce(undefined);
    const { DELETE } = await import("./route");
    const res = await DELETE(makeRequest(), { params: Promise.resolve({ id: "a-1", itemId: "item-x" }) });
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it("removeItemFromArchive called with archiveId and itemId", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    getArchiveByIdMock.mockResolvedValueOnce(ARCHIVE);
    getArchiveItemsMock.mockResolvedValueOnce([{ itemId: "item-del" }]);
    removeItemFromArchiveMock.mockResolvedValueOnce(undefined);
    const { DELETE } = await import("./route");
    await DELETE(makeRequest(), { params: Promise.resolve({ id: "a-1", itemId: "item-del" }) });
    expect(removeItemFromArchiveMock).toHaveBeenCalledWith("a-1", "item-del");
  });
});
