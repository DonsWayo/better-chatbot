import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const { getSessionMock, archiveRepositoryMock } = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  archiveRepositoryMock: {
    getArchiveById: vi.fn(),
    getArchiveItems: vi.fn(),
    removeItemFromArchive: vi.fn(),
  },
}));

vi.mock("auth/server", () => ({ getSession: getSessionMock }));
vi.mock("lib/db/repository", () => ({
  archiveRepository: archiveRepositoryMock,
}));

import { DELETE } from "./route";

const makeContext = (id: string, itemId: string) => ({
  params: Promise.resolve({ id, itemId }),
});

const ARCHIVE = { id: "arch-1", name: "My Archive", userId: "user-1" };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("DELETE /api/archive/[id]/items/[itemId]", () => {
  it("returns 401 when no session", async () => {
    getSessionMock.mockResolvedValue(null);
    const res = await DELETE(new Request("http://x"), makeContext("arch-1", "item-1"));
    expect(res.status).toBe(401);
  });

  it("returns 404 when archive not found", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    archiveRepositoryMock.getArchiveById.mockResolvedValue(null);
    const res = await DELETE(new Request("http://x"), makeContext("arch-1", "item-1"));
    expect(res.status).toBe(404);
  });

  it("returns 403 when user does not own archive", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-2" } });
    archiveRepositoryMock.getArchiveById.mockResolvedValue(ARCHIVE);
    const res = await DELETE(new Request("http://x"), makeContext("arch-1", "item-1"));
    expect(res.status).toBe(403);
  });

  it("returns 404 when item not in archive", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    archiveRepositoryMock.getArchiveById.mockResolvedValue(ARCHIVE);
    archiveRepositoryMock.getArchiveItems.mockResolvedValue([
      { itemId: "other-item" },
    ]);
    const res = await DELETE(new Request("http://x"), makeContext("arch-1", "item-1"));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/not found/i);
  });

  it("removes item and returns success", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    archiveRepositoryMock.getArchiveById.mockResolvedValue(ARCHIVE);
    archiveRepositoryMock.getArchiveItems.mockResolvedValue([{ itemId: "item-1" }]);
    archiveRepositoryMock.removeItemFromArchive.mockResolvedValue(undefined);
    const res = await DELETE(new Request("http://x"), makeContext("arch-1", "item-1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it("calls removeItemFromArchive with archive id and item id", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    archiveRepositoryMock.getArchiveById.mockResolvedValue(ARCHIVE);
    archiveRepositoryMock.getArchiveItems.mockResolvedValue([{ itemId: "item-xyz" }]);
    archiveRepositoryMock.removeItemFromArchive.mockResolvedValue(undefined);
    await DELETE(new Request("http://x"), makeContext("arch-1", "item-xyz"));
    expect(archiveRepositoryMock.removeItemFromArchive).toHaveBeenCalledWith(
      "arch-1",
      "item-xyz",
    );
  });

  it("returns 500 on unexpected error", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    archiveRepositoryMock.getArchiveById.mockRejectedValue(new Error("DB fail"));
    const res = await DELETE(new Request("http://x"), makeContext("arch-1", "item-1"));
    expect(res.status).toBe(500);
  });

  it("calls getArchiveById with the archive id from params", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    archiveRepositoryMock.getArchiveById.mockResolvedValue(null);
    await DELETE(new Request("http://x"), makeContext("arch-999", "item-1"));
    expect(archiveRepositoryMock.getArchiveById).toHaveBeenCalledWith("arch-999");
  });

  it("calls getArchiveItems with the archive id", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    archiveRepositoryMock.getArchiveById.mockResolvedValue(ARCHIVE);
    archiveRepositoryMock.getArchiveItems.mockResolvedValue([{ itemId: "item-1" }]);
    archiveRepositoryMock.removeItemFromArchive.mockResolvedValue(undefined);
    await DELETE(new Request("http://x"), makeContext("arch-1", "item-1"));
    expect(archiveRepositoryMock.getArchiveItems).toHaveBeenCalledWith("arch-1");
  });

  it("does not call removeItemFromArchive when item does not exist", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    archiveRepositoryMock.getArchiveById.mockResolvedValue(ARCHIVE);
    archiveRepositoryMock.getArchiveItems.mockResolvedValue([{ itemId: "other" }]);
    await DELETE(new Request("http://x"), makeContext("arch-1", "item-1"));
    expect(archiveRepositoryMock.removeItemFromArchive).not.toHaveBeenCalled();
  });

  it("returns 200 response body with success: true", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    archiveRepositoryMock.getArchiveById.mockResolvedValue(ARCHIVE);
    archiveRepositoryMock.getArchiveItems.mockResolvedValue([{ itemId: "item-1" }]);
    archiveRepositoryMock.removeItemFromArchive.mockResolvedValue(undefined);
    const res = await DELETE(new Request("http://x"), makeContext("arch-1", "item-1"));
    const body = await res.json();
    expect(body).toHaveProperty("success", true);
  });

  it("getSession is called exactly once per request", async () => {
    getSessionMock.mockResolvedValue(null);
    await DELETE(new Request("http://x"), makeContext("arch-1", "item-1"));
    expect(getSessionMock).toHaveBeenCalledTimes(1);
  });

  it("does not call getArchiveById when session is null", async () => {
    getSessionMock.mockResolvedValue(null);
    await DELETE(new Request("http://x"), makeContext("arch-1", "item-1"));
    expect(archiveRepositoryMock.getArchiveById).not.toHaveBeenCalled();
  });

  it("removeItemFromArchive called exactly once on success", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    archiveRepositoryMock.getArchiveById.mockResolvedValue(ARCHIVE);
    archiveRepositoryMock.getArchiveItems.mockResolvedValue([{ itemId: "item-1" }]);
    archiveRepositoryMock.removeItemFromArchive.mockResolvedValue(undefined);
    await DELETE(new Request("http://x"), makeContext("arch-1", "item-1"));
    expect(archiveRepositoryMock.removeItemFromArchive).toHaveBeenCalledTimes(1);
  });
});
