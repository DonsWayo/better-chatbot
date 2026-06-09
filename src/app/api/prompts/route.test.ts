import { describe, it, expect, vi, beforeEach } from "vitest";

const { getSessionMock, dbSelectMock, dbInsertMock } = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  dbSelectMock: vi.fn(),
  dbInsertMock: vi.fn(),
}));

vi.mock("lib/auth/server", () => ({ getSession: getSessionMock }));

const dbSelectWhereMock = vi.fn().mockResolvedValue([]);
const dbSelectOrderByMock = vi.fn().mockResolvedValue([]);
const dbSelectFromMock = vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ orderBy: dbSelectOrderByMock }) });
dbSelectMock.mockReturnValue({ from: dbSelectFromMock });

const dbInsertReturningMock = vi.fn().mockResolvedValue([]);
const dbInsertValuesMock = vi.fn().mockReturnValue({ returning: dbInsertReturningMock });
dbInsertMock.mockReturnValue({ values: dbInsertValuesMock });

vi.mock("lib/db/pg/db.pg", () => ({
  pgDb: { select: dbSelectMock, insert: dbInsertMock },
}));
vi.mock("lib/db/pg/schema.pg", () => ({
  AsafePromptTemplateTable: { id: "id", visibility: "visibility", authorId: "authorId", createdAt: "createdAt" },
}));
vi.mock("drizzle-orm", () => ({
  eq: vi.fn((_a: unknown, _b: unknown) => ({})),
  or: vi.fn((..._args: unknown[]) => ({})),
}));

function makeRequest(body?: unknown): Request {
  return { json: () => Promise.resolve(body) } as unknown as Request;
}

describe("GET /api/prompts", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns 401 when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns 200 with prompts for authenticated user", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1", role: "user" } });
    dbSelectOrderByMock.mockResolvedValueOnce([
      { id: "p-1", title: "Summarise", visibility: "org" },
    ]);
    const { GET } = await import("./route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
  });
});

describe("POST /api/prompts", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns 401 when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ title: "T", content: "C" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 when title is missing", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1", role: "user" } });
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ content: "C" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/title/);
  });

  it("returns 400 when content is missing", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1", role: "user" } });
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ title: "T" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/content/);
  });

  it("creates prompt and returns 201 for authenticated user", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1", role: "user" } });
    dbInsertReturningMock.mockResolvedValueOnce([{
      id: "p-new",
      title: "My Prompt",
      content: "Summarise this text",
      visibility: "private",
    }]);
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ title: "My Prompt", content: "Summarise this text" }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.title).toBe("My Prompt");
  });

  it("never calls dbInsert when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    await POST(makeRequest({ title: "T", content: "C" }));
    expect(dbInsertMock).not.toHaveBeenCalled();
  });

  it("201 response has id field", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1", role: "user" } });
    dbInsertReturningMock.mockResolvedValueOnce([{ id: "p-xyz", title: "T", content: "C" }]);
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ title: "T", content: "C" }));
    const body = await res.json();
    expect(body.id).toBe("p-xyz");
  });
});

describe("GET /api/prompts — guard chains", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("never calls dbSelect when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    await GET();
    expect(dbSelectMock).not.toHaveBeenCalled();
  });

  it("200 body is an array", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1", role: "user" } });
    dbSelectOrderByMock.mockResolvedValueOnce([]);
    const { GET } = await import("./route");
    const res = await GET();
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });
});
