import { describe, it, expect, vi, beforeEach } from "vitest";

const { getSessionMock, dbSelectMock, dbUpdateMock, dbDeleteMock } = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  dbSelectMock: vi.fn(),
  dbUpdateMock: vi.fn(),
  dbDeleteMock: vi.fn(),
}));

vi.mock("lib/auth/server", () => ({ getSession: getSessionMock }));

const PROMPT = { id: "p-1", title: "Original", content: "Do X", authorId: "u1", visibility: "private" };

// Select chain
const dbSelectWhereMock = vi.fn().mockResolvedValue([PROMPT]);
const dbSelectFromMock = vi.fn().mockReturnValue({ where: dbSelectWhereMock });
dbSelectMock.mockReturnValue({ from: dbSelectFromMock });

// Update chain
const dbUpdateReturningMock = vi.fn().mockResolvedValue([{ ...PROMPT, title: "Updated" }]);
const dbUpdateWhereMock = vi.fn().mockReturnValue({ returning: dbUpdateReturningMock });
const dbUpdateSetMock = vi.fn().mockReturnValue({ where: dbUpdateWhereMock });
dbUpdateMock.mockReturnValue({ set: dbUpdateSetMock });

// Delete chain
const dbDeleteWhereMock = vi.fn().mockResolvedValue([]);
dbDeleteMock.mockReturnValue({ where: dbDeleteWhereMock });

vi.mock("lib/db/pg/db.pg", () => ({
  pgDb: { select: dbSelectMock, update: dbUpdateMock, delete: dbDeleteMock },
}));
vi.mock("lib/db/pg/schema.pg", () => ({
  AsafePromptTemplateTable: { id: "id", authorId: "authorId", updatedAt: "updatedAt" },
}));
vi.mock("drizzle-orm", () => ({
  eq: vi.fn((_a: unknown, _b: unknown) => ({})),
  and: vi.fn((..._args: unknown[]) => ({})),
}));

function makeRequest(body?: unknown): Request {
  return { json: () => Promise.resolve(body) } as unknown as Request;
}

describe("GET /api/prompts/[id]", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns 401 when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), { params: Promise.resolve({ id: "p-1" }) });
    expect(res.status).toBe(401);
  });

  it("returns 404 when not found", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1", role: "user" } });
    dbSelectWhereMock.mockResolvedValueOnce([]);
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), { params: Promise.resolve({ id: "missing" }) });
    expect(res.status).toBe(404);
  });

  it("returns 200 with prompt", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1", role: "user" } });
    dbSelectWhereMock.mockResolvedValueOnce([PROMPT]);
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), { params: Promise.resolve({ id: "p-1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe("p-1");
  });
});

describe("PATCH /api/prompts/[id]", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns 401 when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { PATCH } = await import("./route");
    const res = await PATCH(makeRequest({ title: "New" }), { params: Promise.resolve({ id: "p-1" }) });
    expect(res.status).toBe(401);
  });

  it("returns 404 when not found", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1", role: "user" } });
    dbSelectWhereMock.mockResolvedValueOnce([]);
    const { PATCH } = await import("./route");
    const res = await PATCH(makeRequest({ title: "New" }), { params: Promise.resolve({ id: "missing" }) });
    expect(res.status).toBe(404);
  });

  it("returns 403 when user is not owner and not admin", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "other-user", role: "user" } });
    dbSelectWhereMock.mockResolvedValueOnce([PROMPT]); // owner is u1
    const { PATCH } = await import("./route");
    const res = await PATCH(makeRequest({ title: "Hijacked" }), { params: Promise.resolve({ id: "p-1" }) });
    expect(res.status).toBe(403);
  });

  it("allows admin to update any prompt", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "admin-1", role: "admin" } });
    dbSelectWhereMock.mockResolvedValueOnce([PROMPT]);
    dbUpdateReturningMock.mockResolvedValueOnce([{ ...PROMPT, title: "Admin updated" }]);
    const { PATCH } = await import("./route");
    const res = await PATCH(makeRequest({ title: "Admin updated" }), { params: Promise.resolve({ id: "p-1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.title).toBe("Admin updated");
  });

  it("allows owner to update their own prompt", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1", role: "user" } });
    dbSelectWhereMock.mockResolvedValueOnce([PROMPT]);
    dbUpdateReturningMock.mockResolvedValueOnce([{ ...PROMPT, title: "My update" }]);
    const { PATCH } = await import("./route");
    const res = await PATCH(makeRequest({ title: "My update" }), { params: Promise.resolve({ id: "p-1" }) });
    expect(res.status).toBe(200);
  });
});

describe("DELETE /api/prompts/[id]", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns 401 when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { DELETE } = await import("./route");
    const res = await DELETE(makeRequest(), { params: Promise.resolve({ id: "p-1" }) });
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-owner non-admin", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "other", role: "user" } });
    dbSelectWhereMock.mockResolvedValueOnce([PROMPT]);
    const { DELETE } = await import("./route");
    const res = await DELETE(makeRequest(), { params: Promise.resolve({ id: "p-1" }) });
    expect(res.status).toBe(403);
  });

  it("deletes and returns ok for owner", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1", role: "user" } });
    dbSelectWhereMock.mockResolvedValueOnce([PROMPT]);
    const { DELETE } = await import("./route");
    const res = await DELETE(makeRequest(), { params: Promise.resolve({ id: "p-1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });
});
