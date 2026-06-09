import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const { getSessionMock, archiveRepositoryMock } = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  archiveRepositoryMock: {
    getArchiveById: vi.fn(),
    getArchiveItems: vi.fn(),
    addItemToArchive: vi.fn(),
  },
}));

vi.mock("auth/server", () => ({ getSession: getSessionMock }));
vi.mock("lib/db/repository", () => ({
  archiveRepository: archiveRepositoryMock,
}));

import { GET, POST } from "./route";

const makeContext = (id: string) => ({ params: Promise.resolve({ id }) });
const makeRequest = (body: unknown) =>
  new Request("http://localhost", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });

const ARCHIVE = { id: "arch-1", name: "My Archive", userId: "user-1" };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/archive/[id]/items", () => {
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

  it("returns items for archive owner", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    archiveRepositoryMock.getArchiveById.mockResolvedValue(ARCHIVE);
    archiveRepositoryMock.getArchiveItems.mockResolvedValue([{ id: "item-1" }, { id: "item-2" }]);
    const res = await GET(new Request("http://x"), makeContext("arch-1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(2);
  });

  it("calls getArchiveItems with the archive id", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    archiveRepositoryMock.getArchiveById.mockResolvedValue(ARCHIVE);
    archiveRepositoryMock.getArchiveItems.mockResolvedValue([]);
    await GET(new Request("http://x"), makeContext("arch-xyz"));
    expect(archiveRepositoryMock.getArchiveItems).toHaveBeenCalledWith("arch-xyz");
  });

  it("returns 500 on error", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    archiveRepositoryMock.getArchiveById.mockRejectedValue(new Error("DB fail"));
    const res = await GET(new Request("http://x"), makeContext("arch-1"));
    expect(res.status).toBe(500);
  });
});

describe("POST /api/archive/[id]/items", () => {
  it("returns 401 when no session", async () => {
    getSessionMock.mockResolvedValue(null);
    const res = await POST(makeRequest({ itemId: "thread-1" }), makeContext("arch-1"));
    expect(res.status).toBe(401);
  });

  it("returns 404 when archive not found", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    archiveRepositoryMock.getArchiveById.mockResolvedValue(null);
    const res = await POST(makeRequest({ itemId: "thread-1" }), makeContext("arch-1"));
    expect(res.status).toBe(404);
  });

  it("returns 403 when user does not own archive", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-2" } });
    archiveRepositoryMock.getArchiveById.mockResolvedValue(ARCHIVE);
    const res = await POST(makeRequest({ itemId: "thread-1" }), makeContext("arch-1"));
    expect(res.status).toBe(403);
  });

  it("returns 400 on invalid body (missing itemId)", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    archiveRepositoryMock.getArchiveById.mockResolvedValue(ARCHIVE);
    const res = await POST(makeRequest({}), makeContext("arch-1"));
    expect(res.status).toBe(400);
  });

  it("adds item and returns it for owner", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    archiveRepositoryMock.getArchiveById.mockResolvedValue(ARCHIVE);
    const newItem = { id: "ai-1", archiveId: "arch-1", itemId: "thread-1" };
    archiveRepositoryMock.addItemToArchive.mockResolvedValue(newItem);
    const res = await POST(makeRequest({ itemId: "thread-1" }), makeContext("arch-1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.itemId).toBe("thread-1");
  });

  it("calls addItemToArchive with correct args", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    archiveRepositoryMock.getArchiveById.mockResolvedValue(ARCHIVE);
    archiveRepositoryMock.addItemToArchive.mockResolvedValue({ id: "ai-1" });
    await POST(makeRequest({ itemId: "thread-99" }), makeContext("arch-1"));
    expect(archiveRepositoryMock.addItemToArchive).toHaveBeenCalledWith(
      "arch-1",
      "thread-99",
      "user-1",
    );
  });

  it("returns 500 on error", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    archiveRepositoryMock.getArchiveById.mockResolvedValue(ARCHIVE);
    archiveRepositoryMock.addItemToArchive.mockRejectedValue(new Error("DB fail"));
    const res = await POST(makeRequest({ itemId: "t-1" }), makeContext("arch-1"));
    expect(res.status).toBe(500);
  });

  it("does not call addItemToArchive when session is null", async () => {
    getSessionMock.mockResolvedValue(null);
    await POST(makeRequest({ itemId: "t-1" }), makeContext("arch-1"));
    expect(archiveRepositoryMock.addItemToArchive).not.toHaveBeenCalled();
  });

  it("calls addItemToArchive exactly once when authorized", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    archiveRepositoryMock.getArchiveById.mockResolvedValue(ARCHIVE);
    archiveRepositoryMock.addItemToArchive.mockResolvedValue({ id: "ai-1" });
    await POST(makeRequest({ itemId: "t-1" }), makeContext("arch-1"));
    expect(archiveRepositoryMock.addItemToArchive).toHaveBeenCalledTimes(1);
  });
});

describe("GET /api/archive/[id]/items — extra coverage", () => {
  it("does not call getArchiveItems when session is null", async () => {
    getSessionMock.mockResolvedValue(null);
    await GET(new Request("http://x"), makeContext("arch-1"));
    expect(archiveRepositoryMock.getArchiveItems).not.toHaveBeenCalled();
  });
});
