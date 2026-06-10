import { beforeEach, describe, expect, it, vi } from "vitest";

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
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), {
      params: Promise.resolve({ id: "a-1" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 404 when archive not found", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    getArchiveByIdMock.mockResolvedValueOnce(null);
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), {
      params: Promise.resolve({ id: "missing" }),
    });
    expect(res.status).toBe(404);
  });

  it("returns items for owned archive", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    getArchiveByIdMock.mockResolvedValueOnce(ARCHIVE);
    getArchiveItemsMock.mockResolvedValueOnce([
      { itemId: "item-1" },
      { itemId: "item-2" },
    ]);
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), {
      params: Promise.resolve({ id: "a-1" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(2);
  });
});

describe("POST /api/archive/[id]/items", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ itemId: "item-1" }), {
      params: Promise.resolve({ id: "a-1" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 404 when archive not found", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    getArchiveByIdMock.mockResolvedValueOnce(null);
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ itemId: "item-1" }), {
      params: Promise.resolve({ id: "missing" }),
    });
    expect(res.status).toBe(404);
  });

  it("adds item to archive and returns created item", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    getArchiveByIdMock.mockResolvedValueOnce(ARCHIVE);
    const ITEM = { id: "ai-1", archiveId: "a-1", itemId: "item-42" };
    addItemToArchiveMock.mockResolvedValueOnce(ITEM);
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ itemId: "item-42" }), {
      params: Promise.resolve({ id: "a-1" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.itemId).toBe("item-42");
    expect(addItemToArchiveMock).toHaveBeenCalledWith("a-1", "item-42", "u1");
  });

  it("never calls addItemToArchive when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    await POST(makeRequest({ itemId: "item-1" }), {
      params: Promise.resolve({ id: "a-1" }),
    });
    expect(addItemToArchiveMock).not.toHaveBeenCalled();
  });

  it("never calls addItemToArchive when archive not found", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    getArchiveByIdMock.mockResolvedValueOnce(null);
    const { POST } = await import("./route");
    await POST(makeRequest({ itemId: "item-1" }), {
      params: Promise.resolve({ id: "a-1" }),
    });
    expect(addItemToArchiveMock).not.toHaveBeenCalled();
  });
});

describe("GET /api/archive/[id]/items — guard chains", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

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
    const res = await GET(makeRequest(), {
      params: Promise.resolve({ id: "a-1" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(0);
  });
});

describe("GET /api/archive/[id]/items — additional", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("401 body is text 'Unauthorized'", async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), {
      params: Promise.resolve({ id: "a-1" }),
    });
    expect(await res.text()).toBe("Unauthorized");
  });

  it("never calls getArchiveById when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    await GET(makeRequest(), { params: Promise.resolve({ id: "a-1" }) });
    expect(getArchiveByIdMock).not.toHaveBeenCalled();
  });

  it("getSession called exactly once per GET", async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    await GET(makeRequest(), { params: Promise.resolve({ id: "a-1" }) });
    expect(getSessionMock).toHaveBeenCalledTimes(1);
  });

  it("200 body is an array", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    getArchiveByIdMock.mockResolvedValueOnce(ARCHIVE);
    getArchiveItemsMock.mockResolvedValueOnce([]);
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), {
      params: Promise.resolve({ id: "a-1" }),
    });
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });
});

describe("GET and POST /api/archive/[id]/items — call count invariants", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("getSession called exactly once per GET", async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    await GET(makeRequest(), { params: Promise.resolve({ id: "a-1" }) });
    expect(getSessionMock).toHaveBeenCalledTimes(1);
  });

  it("getArchiveById never called when GET unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    await GET(makeRequest(), { params: Promise.resolve({ id: "a-1" }) });
    expect(getArchiveByIdMock).not.toHaveBeenCalled();
  });

  it("addItemToArchive never called when POST unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    await POST(makeRequest({ itemId: "x", itemType: "chat" }), {
      params: Promise.resolve({ id: "a-1" }),
    });
    expect(addItemToArchiveMock).not.toHaveBeenCalled();
  });

  it("401 body is plain text 'Unauthorized' for GET", async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), {
      params: Promise.resolve({ id: "a-1" }),
    });
    const body = await res.text();
    expect(body).toBe("Unauthorized");
  });
});
describe("POST /api/archive/[id]/items — additional", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("401 body is text 'Unauthorized'", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ itemId: "item-1" }), {
      params: Promise.resolve({ id: "a-1" }),
    });
    expect(await res.text()).toBe("Unauthorized");
  });

  it("never calls getArchiveById when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    await POST(makeRequest({ itemId: "item-1" }), {
      params: Promise.resolve({ id: "a-1" }),
    });
    expect(getArchiveByIdMock).not.toHaveBeenCalled();
  });

  it("addItemToArchive called exactly once on success", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    getArchiveByIdMock.mockResolvedValueOnce(ARCHIVE);
    addItemToArchiveMock.mockResolvedValueOnce({
      id: "ai-1",
      archiveId: "a-1",
      itemId: "item-1",
    });
    const { POST } = await import("./route");
    await POST(makeRequest({ itemId: "item-1" }), {
      params: Promise.resolve({ id: "a-1" }),
    });
    expect(addItemToArchiveMock).toHaveBeenCalledTimes(1);
  });

  it("getSession called exactly once per POST", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    await POST(makeRequest({ itemId: "item-1" }), {
      params: Promise.resolve({ id: "a-1" }),
    });
    expect(getSessionMock).toHaveBeenCalledTimes(1);
  });
});

describe("POST /api/archive/[id]/items — response shape", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("response is always a Response instance", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ itemId: "item-1" }), {
      params: Promise.resolve({ id: "a-1" }),
    });
    expect(res).toBeInstanceOf(Response);
  });

  it("200 body has itemId field matching input", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    getArchiveByIdMock.mockResolvedValueOnce(ARCHIVE);
    addItemToArchiveMock.mockResolvedValueOnce({
      id: "ai-1",
      archiveId: "a-1",
      itemId: "item-42",
    });
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ itemId: "item-42" }), {
      params: Promise.resolve({ id: "a-1" }),
    });
    const body = await res.json();
    expect(body.itemId).toBe("item-42");
  });

  it("getArchiveById called exactly once per POST", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    getArchiveByIdMock.mockResolvedValueOnce(ARCHIVE);
    addItemToArchiveMock.mockResolvedValueOnce({
      id: "ai-1",
      archiveId: "a-1",
      itemId: "item-1",
    });
    const { POST } = await import("./route");
    await POST(makeRequest({ itemId: "item-1" }), {
      params: Promise.resolve({ id: "a-1" }),
    });
    expect(getArchiveByIdMock).toHaveBeenCalledTimes(1);
  });

  it("getSession called exactly once per POST (response shape)", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    await POST(makeRequest({ itemId: "item-1" }), {
      params: Promise.resolve({ id: "a-1" }),
    });
    expect(getSessionMock).toHaveBeenCalledTimes(1);
  });
});

describe("GET /api/archive/[id]/items — response shape", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a Response instance for 401", async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), {
      params: Promise.resolve({ id: "a-1" }),
    });
    expect(res).toBeInstanceOf(Response);
  });

  it("returns a Response instance for 200", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    getArchiveByIdMock.mockResolvedValueOnce(ARCHIVE);
    getArchiveItemsMock.mockResolvedValueOnce([{ itemId: "item-1" }]);
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), {
      params: Promise.resolve({ id: "a-1" }),
    });
    expect(res).toBeInstanceOf(Response);
  });

  it("getArchiveItems called exactly once for authenticated GET", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    getArchiveByIdMock.mockResolvedValueOnce(ARCHIVE);
    getArchiveItemsMock.mockResolvedValueOnce([]);
    const { GET } = await import("./route");
    await GET(makeRequest(), { params: Promise.resolve({ id: "a-1" }) });
    expect(getArchiveItemsMock).toHaveBeenCalledTimes(1);
  });

  it("200 body is an array", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    getArchiveByIdMock.mockResolvedValueOnce(ARCHIVE);
    getArchiveItemsMock.mockResolvedValueOnce([]);
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), {
      params: Promise.resolve({ id: "a-1" }),
    });
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });
});
