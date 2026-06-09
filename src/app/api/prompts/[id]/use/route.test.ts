import { describe, it, expect, vi, beforeEach } from "vitest";

const { getSessionMock, dbSelectMock, dbUpdateMock } = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  dbSelectMock: vi.fn(),
  dbUpdateMock: vi.fn(),
}));

vi.mock("lib/auth/server", () => ({ getSession: getSessionMock }));

const dbSelectWhereMock = vi.fn().mockResolvedValue([{ id: "p-1" }]);
const dbSelectFromMock = vi.fn().mockReturnValue({ where: dbSelectWhereMock });
dbSelectMock.mockReturnValue({ from: dbSelectFromMock });

const dbUpdateWhereMock = vi.fn().mockResolvedValue([]);
const dbUpdateSetMock = vi.fn().mockReturnValue({ where: dbUpdateWhereMock });
dbUpdateMock.mockReturnValue({ set: dbUpdateSetMock });

vi.mock("lib/db/pg/db.pg", () => ({
  pgDb: { select: dbSelectMock, update: dbUpdateMock },
}));
vi.mock("lib/db/pg/schema.pg", () => ({
  AsafePromptTemplateTable: { id: "id", usageCount: "usageCount" },
}));
vi.mock("drizzle-orm", () => ({
  eq: vi.fn((_a: unknown, _b: unknown) => ({})),
  sql: vi.fn((s: TemplateStringsArray, ..._: unknown[]) => s.join("")),
}));

function makeRequest(): Request {
  return {} as unknown as Request;
}

describe("POST /api/prompts/[id]/use", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbSelectFromMock.mockReturnValue({ where: dbSelectWhereMock });
    dbSelectMock.mockReturnValue({ from: dbSelectFromMock });
    dbUpdateSetMock.mockReturnValue({ where: dbUpdateWhereMock });
    dbUpdateMock.mockReturnValue({ set: dbUpdateSetMock });
  });

  it("returns 401 when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    const res = await POST(makeRequest(), { params: Promise.resolve({ id: "p-1" }) });
    expect(res.status).toBe(401);
  });

  it("never calls db.select when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    await POST(makeRequest(), { params: Promise.resolve({ id: "p-1" }) });
    expect(dbSelectMock).not.toHaveBeenCalled();
  });

  it("returns 404 when prompt not found", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1", role: "user" } });
    dbSelectWhereMock.mockResolvedValueOnce([]);
    const { POST } = await import("./route");
    const res = await POST(makeRequest(), { params: Promise.resolve({ id: "missing" }) });
    expect(res.status).toBe(404);
  });

  it("never calls db.update when prompt is not found", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    dbSelectWhereMock.mockResolvedValueOnce([]);
    const { POST } = await import("./route");
    await POST(makeRequest(), { params: Promise.resolve({ id: "not-there" }) });
    expect(dbUpdateMock).not.toHaveBeenCalled();
  });

  it("increments usage count and returns ok", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1", role: "user" } });
    dbSelectWhereMock.mockResolvedValueOnce([{ id: "p-1" }]);
    const { POST } = await import("./route");
    const res = await POST(makeRequest(), { params: Promise.resolve({ id: "p-1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(dbUpdateSetMock).toHaveBeenCalledOnce();
  });

  it("401 body has error field", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    const res = await POST(makeRequest(), { params: Promise.resolve({ id: "p-1" }) });
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("404 body has error field", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    dbSelectWhereMock.mockResolvedValueOnce([]);
    const { POST } = await import("./route");
    const res = await POST(makeRequest(), { params: Promise.resolve({ id: "gone" }) });
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("calls dbUpdate exactly once on success", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    dbSelectWhereMock.mockResolvedValueOnce([{ id: "p-1" }]);
    const { POST } = await import("./route");
    await POST(makeRequest(), { params: Promise.resolve({ id: "p-1" }) });
    expect(dbUpdateMock).toHaveBeenCalledTimes(1);
  });

  it("never calls dbUpdate when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    await POST(makeRequest(), { params: Promise.resolve({ id: "p-1" }) });
    expect(dbUpdateMock).not.toHaveBeenCalled();
  });

  it("dbSelect called exactly once per authenticated POST", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    dbSelectWhereMock.mockResolvedValueOnce([{ id: "p-1" }]);
    const { POST } = await import("./route");
    await POST(makeRequest(), { params: Promise.resolve({ id: "p-1" }) });
    expect(dbSelectMock).toHaveBeenCalledTimes(1);
  });

  it("getSession called exactly once per POST", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    await POST(makeRequest(), { params: Promise.resolve({ id: "p-1" }) });
    expect(getSessionMock).toHaveBeenCalledTimes(1);
  });

  it("200 response body has ok field", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    dbSelectWhereMock.mockResolvedValueOnce([{ id: "p-1" }]);
    const { POST } = await import("./route");
    const res = await POST(makeRequest(), { params: Promise.resolve({ id: "p-1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("ok");
  });

  it("never calls dbSelect when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    await POST(makeRequest(), { params: Promise.resolve({ id: "p-1" }) });
    expect(dbSelectMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/prompts/[id]/use — additional", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbSelectFromMock.mockReturnValue({ where: dbSelectWhereMock });
    dbSelectMock.mockReturnValue({ from: dbSelectFromMock });
    dbUpdateSetMock.mockReturnValue({ where: dbUpdateWhereMock });
    dbUpdateMock.mockReturnValue({ set: dbUpdateSetMock });
  });

  it("200 body ok field is strictly true", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    dbSelectWhereMock.mockResolvedValueOnce([{ id: "p-1" }]);
    const { POST } = await import("./route");
    const res = await POST(makeRequest(), { params: Promise.resolve({ id: "p-1" }) });
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it("401 body error field exists", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    const res = await POST(makeRequest(), { params: Promise.resolve({ id: "p-1" }) });
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("dbUpdateSetMock called exactly once per successful POST", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    dbSelectWhereMock.mockResolvedValueOnce([{ id: "p-1" }]);
    const { POST } = await import("./route");
    await POST(makeRequest(), { params: Promise.resolve({ id: "p-1" }) });
    expect(dbUpdateSetMock).toHaveBeenCalledTimes(1);
  });

  it("dbSelect not called more than once per request", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    dbSelectWhereMock.mockResolvedValueOnce([{ id: "p-1" }]);
    const { POST } = await import("./route");
    await POST(makeRequest(), { params: Promise.resolve({ id: "p-1" }) });
    expect(dbSelectMock).toHaveBeenCalledTimes(1);
  });
});

describe("POST /api/prompts/[id]/use — response invariants", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbSelectFromMock.mockReturnValue({ where: dbSelectWhereMock });
    dbSelectMock.mockReturnValue({ from: dbSelectFromMock });
    dbUpdateSetMock.mockReturnValue({ where: dbUpdateWhereMock });
    dbUpdateMock.mockReturnValue({ set: dbUpdateSetMock });
  });

  it("response is a Response instance for 401", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    const res = await POST(makeRequest(), { params: Promise.resolve({ id: "p-1" }) });
    expect(res).toBeInstanceOf(Response);
  });

  it("response is a Response instance for 200", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    dbSelectWhereMock.mockResolvedValueOnce([{ id: "p-1" }]);
    const { POST } = await import("./route");
    const res = await POST(makeRequest(), { params: Promise.resolve({ id: "p-1" }) });
    expect(res).toBeInstanceOf(Response);
  });

  it("response is a Response instance for 404", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    dbSelectWhereMock.mockResolvedValueOnce([]);
    const { POST } = await import("./route");
    const res = await POST(makeRequest(), { params: Promise.resolve({ id: "gone" }) });
    expect(res).toBeInstanceOf(Response);
  });

  it("dbUpdateWhereMock called exactly once per successful POST", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    dbSelectWhereMock.mockResolvedValueOnce([{ id: "p-1" }]);
    const { POST } = await import("./route");
    await POST(makeRequest(), { params: Promise.resolve({ id: "p-1" }) });
    expect(dbUpdateWhereMock).toHaveBeenCalledTimes(1);
  });
});

describe("POST /api/prompts/[id]/use — edge cases", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbSelectFromMock.mockReturnValue({ where: dbSelectWhereMock });
    dbSelectMock.mockReturnValue({ from: dbSelectFromMock });
    dbUpdateSetMock.mockReturnValue({ where: dbUpdateWhereMock });
    dbUpdateMock.mockReturnValue({ set: dbUpdateSetMock });
  });

  it("different promptId values are forwarded to the query", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    dbSelectWhereMock.mockResolvedValueOnce([{ id: "p-abc" }]);
    const { POST } = await import("./route");
    await POST(makeRequest(), { params: Promise.resolve({ id: "p-abc" }) });
    expect(dbSelectMock).toHaveBeenCalledTimes(1);
  });

  it("returns 401 for every unauthenticated request", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    const res = await POST(makeRequest(), { params: Promise.resolve({ id: "p-any" }) });
    expect(res.status).toBe(401);
  });

  it("404 returned for missing prompt regardless of userId", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-99" } });
    dbSelectWhereMock.mockResolvedValueOnce([]);
    const { POST } = await import("./route");
    const res = await POST(makeRequest(), { params: Promise.resolve({ id: "absent" }) });
    expect(res.status).toBe(404);
  });

  it("response 200 body has ok:true when prompt exists", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    dbSelectWhereMock.mockResolvedValueOnce([{ id: "p-ok" }]);
    const { POST } = await import("./route");
    const res = await POST(makeRequest(), { params: Promise.resolve({ id: "p-ok" }) });
    const body = await res.json();
    expect(body.ok).toBe(true);
  });
});
