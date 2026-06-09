import { describe, it, expect, vi, beforeEach } from "vitest";

const { getSessionMock, dbUpdateMock, dbSelectMock, writeAuditLogMock } = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  dbUpdateMock: vi.fn(),
  dbSelectMock: vi.fn(),
  writeAuditLogMock: vi.fn(),
}));

vi.mock("lib/auth/server", () => ({ getSession: getSessionMock }));
vi.mock("lib/compliance/audit", () => ({ writeAuditLog: writeAuditLogMock }));

// Update chain
const dbUpdateWhereMock = vi.fn().mockResolvedValue([]);
const dbUpdateSetMock = vi.fn().mockReturnValue({ where: dbUpdateWhereMock });
dbUpdateMock.mockReturnValue({ set: dbUpdateSetMock });

// Select chain
const dbSelectLimitMock = vi.fn().mockResolvedValue([]);
const dbSelectWhereMock = vi.fn().mockReturnValue({ limit: dbSelectLimitMock });
const dbSelectFromMock = vi.fn().mockReturnValue({ where: dbSelectWhereMock });
dbSelectMock.mockReturnValue({ from: dbSelectFromMock });

vi.mock("lib/db/pg/db.pg", () => ({
  pgDb: { update: dbUpdateMock, select: dbSelectMock },
}));
vi.mock("lib/db/pg/schema.pg", () => ({
  UserTable: { id: "id", acceptedAupAt: "acceptedAupAt" },
}));
vi.mock("drizzle-orm", () => ({
  eq: vi.fn((_a: unknown, _b: unknown) => ({})),
}));

describe("POST /api/compliance/aup", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns 401 when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    const res = await POST();
    expect(res.status).toBe(401);
  });

  it("records AUP acceptance and returns ok with timestamp", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    const { POST } = await import("./route");
    const res = await POST();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.acceptedAt).toBeDefined();
    expect(dbUpdateSetMock).toHaveBeenCalledOnce();
  });

  it("fires audit log in the background (fire-and-forget)", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    writeAuditLogMock.mockResolvedValue(undefined);
    const { POST } = await import("./route");
    await POST();
    // writeAuditLog is called with void — we can only check it was triggered
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "aup_accepted", userId: "u1" }),
    );
  });
});

describe("GET /api/compliance/aup", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns 401 when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns accepted=false when no aupAt", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    dbSelectLimitMock.mockResolvedValueOnce([{ acceptedAupAt: null }]);
    const { GET } = await import("./route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.accepted).toBe(false);
    expect(body.acceptedAt).toBeNull();
  });

  it("returns accepted=true when acceptedAupAt is set", async () => {
    const acceptedAt = new Date().toISOString();
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    dbSelectLimitMock.mockResolvedValueOnce([{ acceptedAupAt: acceptedAt }]);
    const { GET } = await import("./route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.accepted).toBe(true);
    expect(body.acceptedAt).toBe(acceptedAt);
  });

  it("never calls db select when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    await GET();
    expect(dbSelectMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/compliance/aup — guard chains", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("never calls dbUpdate when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    await POST();
    expect(dbUpdateMock).not.toHaveBeenCalled();
  });

  it("acceptedAt in response body is an ISO string", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    const { POST } = await import("./route");
    const res = await POST();
    const body = await res.json();
    expect(typeof body.acceptedAt).toBe("string");
    expect(body.acceptedAt.length).toBeGreaterThan(0);
  });

  it("calls dbUpdate exactly once per successful POST", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    const { POST } = await import("./route");
    await POST();
    expect(dbUpdateMock).toHaveBeenCalledTimes(1);
  });

  it("401 body has error field for POST", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    const res = await POST();
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("getSession called exactly once per POST", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    const { POST } = await import("./route");
    await POST();
    expect(getSessionMock).toHaveBeenCalledTimes(1);
  });
});

describe("GET /api/compliance/aup — additional", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("401 body has error field for GET", async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    const res = await GET();
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("accepted is strictly boolean type", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    dbSelectLimitMock.mockResolvedValueOnce([{ acceptedAupAt: null }]);
    const { GET } = await import("./route");
    const res = await GET();
    const body = await res.json();
    expect(typeof body.accepted).toBe("boolean");
  });

  it("getSession called exactly once per GET", async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    await GET();
    expect(getSessionMock).toHaveBeenCalledTimes(1);
  });

  it("dbSelect called exactly once for authenticated GET", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    dbSelectLimitMock.mockResolvedValueOnce([{ acceptedAupAt: null }]);
    const { GET } = await import("./route");
    await GET();
    expect(dbSelectMock).toHaveBeenCalledTimes(1);
  });

  it("200 body has both accepted and acceptedAt properties", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    dbSelectLimitMock.mockResolvedValueOnce([{ acceptedAupAt: null }]);
    const { GET } = await import("./route");
    const res = await GET();
    const body = await res.json();
    expect(body).toHaveProperty("accepted");
    expect(body).toHaveProperty("acceptedAt");
  });
});
