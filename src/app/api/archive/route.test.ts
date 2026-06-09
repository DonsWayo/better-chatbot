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

describe("GET /api/archive — guard chain", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("401 body is plain text Unauthorized", async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    const res = await GET();
    const text = await res.text();
    expect(text).toMatch(/Unauthorized/i);
  });

  it("getArchivesByUserId called exactly once per authenticated GET", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    getArchivesByUserIdMock.mockResolvedValueOnce([]);
    const { GET } = await import("./route");
    await GET();
    expect(getArchivesByUserIdMock).toHaveBeenCalledTimes(1);
  });

  it("200 response body is an array", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    getArchivesByUserIdMock.mockResolvedValueOnce([]);
    const { GET } = await import("./route");
    const res = await GET();
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  it("500 body is plain text on GET error", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    getArchivesByUserIdMock.mockRejectedValueOnce(new Error("DB down"));
    const { GET } = await import("./route");
    const res = await GET();
    const text = await res.text();
    expect(text.length).toBeGreaterThan(0);
  });

  it("getSession called exactly once per GET request", async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    await GET();
    expect(getSessionMock).toHaveBeenCalledTimes(1);
  });
});

describe("POST /api/archive — guard chain", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("401 body is plain text Unauthorized", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ name: "Test" }));
    const text = await res.text();
    expect(text).toMatch(/Unauthorized/i);
  });

  it("createArchive called exactly once per authenticated POST", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    createArchiveMock.mockResolvedValueOnce({ id: "a-1", name: "Test", userId: "u1" });
    const { POST } = await import("./route");
    await POST(makeRequest({ name: "Test" }));
    expect(createArchiveMock).toHaveBeenCalledTimes(1);
  });

  it("200 response includes archive id on success", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    createArchiveMock.mockResolvedValueOnce({ id: "arch-unique-777", name: "Test", userId: "u1" });
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ name: "Test" }));
    const body = await res.json();
    expect(body.id).toBe("arch-unique-777");
  });

  it("500 body has message field on POST error", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    createArchiveMock.mockRejectedValueOnce(new Error("DB error"));
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ name: "Test" }));
    const body = await res.json();
    expect(body).toHaveProperty("message");
  });

  it("getSession called exactly once per POST request", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    await POST(makeRequest({ name: "Test" }));
    expect(getSessionMock).toHaveBeenCalledTimes(1);
  });
});

describe("POST /api/archive — response shape", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("response is always a Response instance", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ name: "Test" }));
    expect(res).toBeInstanceOf(Response);
  });

  it("200 body has id field on success", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    createArchiveMock.mockResolvedValueOnce({ id: "arch-200", name: "Test", userId: "u1" });
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ name: "Test" }));
    const body = await res.json();
    expect(body).toHaveProperty("id");
  });

  it("createArchive receives the correct userId", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "session-user-101" } });
    createArchiveMock.mockResolvedValueOnce({ id: "a-1", name: "Test", userId: "session-user-101" });
    const { POST } = await import("./route");
    await POST(makeRequest({ name: "Test" }));
    expect(createArchiveMock).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "session-user-101" }),
    );
  });

  it("GET response is always a Response instance", async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    const res = await GET();
    expect(res).toBeInstanceOf(Response);
  });
});

describe("GET and POST /api/archive — call count invariants", () => {
  beforeEach(() => { vi.clearAllMocks(); vi.resetModules(); });

  it("getSession called exactly once per GET", async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    await GET();
    expect(getSessionMock).toHaveBeenCalledTimes(1);
  });

  it("getArchivesByUserId never called when GET unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    await GET();
    expect(getArchivesByUserIdMock).not.toHaveBeenCalled();
  });

  it("createArchive never called when POST unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    await POST(makeRequest({ name: "test" }));
    expect(createArchiveMock).not.toHaveBeenCalled();
  });

  it("POST returns Response instance for 401", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ name: "test" }));
    expect(res).toBeInstanceOf(Response);
    expect(res.status).toBe(401);
  });
});
