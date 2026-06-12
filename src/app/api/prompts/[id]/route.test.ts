import { describe, it, expect, vi, beforeEach } from "vitest";

const { getSessionMock, dbSelectMock, dbUpdateMock, dbDeleteMock, listUserTeamsMock } = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  dbSelectMock: vi.fn(),
  dbUpdateMock: vi.fn(),
  dbDeleteMock: vi.fn(),
  listUserTeamsMock: vi.fn().mockResolvedValue([]),
}));

vi.mock("lib/auth/server", () => ({ getSession: getSessionMock }));
vi.mock("lib/teamspaces/folders", () => ({ listUserTeams: listUserTeamsMock }));

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
  AsafePromptTemplateTable: { id: "id", authorId: "authorId", visibility: "visibility", teamId: "teamId", updatedAt: "updatedAt" },
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

describe("GET /api/prompts/[id] — visibility gate (IDOR)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbSelectMock.mockReturnValue({ from: dbSelectFromMock });
    dbSelectFromMock.mockReturnValue({ where: dbSelectWhereMock });
    listUserTeamsMock.mockResolvedValue([]);
  });

  it("returns 404 when another user reads an author's PRIVATE prompt", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "attacker", role: "user" } });
    dbSelectWhereMock.mockResolvedValueOnce([
      { id: "p-1", authorId: "victim", visibility: "private", content: "secret" },
    ]);
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), { params: Promise.resolve({ id: "p-1" }) });
    expect(res.status).toBe(404);
  });

  it("returns org-visible prompts to any authenticated user", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "someone", role: "user" } });
    dbSelectWhereMock.mockResolvedValueOnce([
      { id: "p-1", authorId: "victim", visibility: "org" },
    ]);
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), { params: Promise.resolve({ id: "p-1" }) });
    expect(res.status).toBe(200);
  });

  it("returns team-visible prompts only to members of the team", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "member", role: "user" } });
    dbSelectWhereMock.mockResolvedValueOnce([
      { id: "p-1", authorId: "victim", visibility: "team", teamId: "team-A" },
    ]);
    listUserTeamsMock.mockResolvedValue([{ id: "team-A" }]);
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), { params: Promise.resolve({ id: "p-1" }) });
    expect(res.status).toBe(200);
  });

  it("returns 404 for a team-visible prompt when caller is not a member", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "outsider", role: "user" } });
    dbSelectWhereMock.mockResolvedValueOnce([
      { id: "p-1", authorId: "victim", visibility: "team", teamId: "team-A" },
    ]);
    listUserTeamsMock.mockResolvedValue([{ id: "team-B" }]);
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), { params: Promise.resolve({ id: "p-1" }) });
    expect(res.status).toBe(404);
  });

  it("admin can read any private prompt", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "admin", role: "admin" } });
    dbSelectWhereMock.mockResolvedValueOnce([
      { id: "p-1", authorId: "victim", visibility: "private" },
    ]);
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), { params: Promise.resolve({ id: "p-1" }) });
    expect(res.status).toBe(200);
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

describe("GET /api/prompts/[id] — additional", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("getSession called exactly once per GET", async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    await GET(makeRequest(), { params: Promise.resolve({ id: "p-1" }) });
    expect(getSessionMock).toHaveBeenCalledTimes(1);
  });

  it("dbSelect never called when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    await GET(makeRequest(), { params: Promise.resolve({ id: "p-1" }) });
    expect(dbSelectMock).not.toHaveBeenCalled();
  });

  it("200 body contains prompt id", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1", role: "user" } });
    dbSelectWhereMock.mockResolvedValueOnce([PROMPT]);
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), { params: Promise.resolve({ id: "p-1" }) });
    const body = await res.json();
    expect(body.id).toBe("p-1");
  });
});

describe("PATCH /api/prompts/[id] — additional", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("getSession called exactly once per PATCH", async () => {
    getSessionMock.mockResolvedValue(null);
    const { PATCH } = await import("./route");
    await PATCH(makeRequest({ title: "X" }), { params: Promise.resolve({ id: "p-1" }) });
    expect(getSessionMock).toHaveBeenCalledTimes(1);
  });

  it("dbUpdate never called when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { PATCH } = await import("./route");
    await PATCH(makeRequest({ title: "X" }), { params: Promise.resolve({ id: "p-1" }) });
    expect(dbUpdateMock).not.toHaveBeenCalled();
  });

  it("admin can update and 200 body has updated title", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "admin-2", role: "admin" } });
    dbSelectWhereMock.mockResolvedValueOnce([PROMPT]);
    dbUpdateReturningMock.mockResolvedValueOnce([{ ...PROMPT, title: "Admin Title" }]);
    const { PATCH } = await import("./route");
    const res = await PATCH(makeRequest({ title: "Admin Title" }), { params: Promise.resolve({ id: "p-1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.title).toBe("Admin Title");
  });
});

describe("DELETE /api/prompts/[id] — additional", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("admin can delete any prompt", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "admin-x", role: "admin" } });
    dbSelectWhereMock.mockResolvedValueOnce([PROMPT]);
    const { DELETE } = await import("./route");
    const res = await DELETE(makeRequest(), { params: Promise.resolve({ id: "p-1" }) });
    expect(res.status).toBe(200);
  });

  it("dbDelete never called when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { DELETE } = await import("./route");
    await DELETE(makeRequest(), { params: Promise.resolve({ id: "p-1" }) });
    expect(dbDeleteMock).not.toHaveBeenCalled();
  });

  it("getSession called exactly once per DELETE", async () => {
    getSessionMock.mockResolvedValue(null);
    const { DELETE } = await import("./route");
    await DELETE(makeRequest(), { params: Promise.resolve({ id: "p-1" }) });
    expect(getSessionMock).toHaveBeenCalledTimes(1);
  });
});

describe("PATCH, DELETE /api/prompts/[id] — response invariants", () => {
  beforeEach(() => { vi.clearAllMocks(); vi.resetModules(); dbSelectMock.mockReturnValue({ from: dbSelectFromMock }); dbUpdateMock.mockReturnValue({ set: dbUpdateSetMock }); dbDeleteMock.mockReturnValue({ where: dbDeleteWhereMock }); });

  it("PATCH returns Response instance for 401", async () => {
    getSessionMock.mockResolvedValue(null);
    const { PATCH } = await import("./route");
    const res = await PATCH(makeRequest({ title: "New" }), { params: Promise.resolve({ id: "p-1" }) });
    expect(res).toBeInstanceOf(Response);
    expect(res.status).toBe(401);
  });

  it("DELETE returns Response instance for 401", async () => {
    getSessionMock.mockResolvedValue(null);
    const { DELETE } = await import("./route");
    const res = await DELETE(makeRequest(), { params: Promise.resolve({ id: "p-1" }) });
    expect(res).toBeInstanceOf(Response);
    expect(res.status).toBe(401);
  });

  it("dbUpdate not called when PATCH unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { PATCH } = await import("./route");
    await PATCH(makeRequest({ title: "New" }), { params: Promise.resolve({ id: "p-1" }) });
    expect(dbUpdateMock).not.toHaveBeenCalled();
  });

  it("PATCH returns 404 when prompt not found", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    dbSelectWhereMock.mockResolvedValueOnce([]);
    const { PATCH } = await import("./route");
    const res = await PATCH(makeRequest({ title: "X" }), { params: Promise.resolve({ id: "missing" }) });
    expect(res.status).toBe(404);
  });
});
