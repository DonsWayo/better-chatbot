import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

const { mockDelete } = vi.hoisted(() => ({ mockDelete: vi.fn() }));

vi.mock("lib/db/pg/db.pg", () => ({ pgDb: { delete: mockDelete } }));
vi.mock("@/lib/db/pg/schema.pg", () => ({
  AsafeAuditLogTable: { id: "id", createdAt: "createdAt" },
}));
vi.mock("drizzle-orm", () => ({
  lt: vi.fn(() => ({})),
  sql: Object.assign(vi.fn(() => ({})), { raw: vi.fn(() => ({})) }),
}));
vi.mock("logger", () => ({
  default: { withDefaults: () => ({ info: vi.fn(), error: vi.fn() }) },
}));

function makeRequest(secret?: string): NextRequest {
  const headers = new Headers();
  if (secret) headers.set("authorization", `Bearer ${secret}`);
  return { headers } as unknown as NextRequest;
}

describe("POST /api/cron/audit-purge", () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    process.env = { ...OLD_ENV, CRON_SECRET: "test-secret" };

    const returningMock = vi.fn().mockResolvedValue([]);
    const whereMock = vi.fn().mockReturnValue({ returning: returningMock });
    mockDelete.mockReturnValue({ where: whereMock });
  });

  it("returns 401 without auth", async () => {
    const { POST } = await import("./route");
    const res = await POST(makeRequest());
    expect(res.status).toBe(401);
  });

  it("returns 401 with wrong secret", async () => {
    const { POST } = await import("./route");
    const res = await POST(makeRequest("wrong"));
    expect(res.status).toBe(401);
  });

  it("returns 401 when CRON_SECRET not set", async () => {
    process.env.CRON_SECRET = "";
    const { POST } = await import("./route");
    const res = await POST(makeRequest("test-secret"));
    expect(res.status).toBe(401);
  });

  it("returns deleted count on success", async () => {
    const returningMock = vi.fn().mockResolvedValue([{ id: "a1" }, { id: "a2" }]);
    const whereMock = vi.fn().mockReturnValue({ returning: returningMock });
    mockDelete.mockReturnValue({ where: whereMock });

    const { POST } = await import("./route");
    const res = await POST(makeRequest("test-secret"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.deleted).toBe(2);
    expect(body).toHaveProperty("cutoff");
  });

  it("returns deleted: 0 when nothing to purge", async () => {
    const { POST } = await import("./route");
    const res = await POST(makeRequest("test-secret"));
    const body = await res.json();
    expect(body.deleted).toBe(0);
  });

  it("calls db.delete on AsafeAuditLogTable", async () => {
    const { POST } = await import("./route");
    await POST(makeRequest("test-secret"));
    expect(mockDelete).toHaveBeenCalledTimes(1);
  });

  it("never calls db.delete when unauthorized", async () => {
    const { POST } = await import("./route");
    await POST(makeRequest());
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it("never calls db.delete with wrong secret", async () => {
    const { POST } = await import("./route");
    await POST(makeRequest("wrong-secret"));
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it("returns 200 with deleted and cutoff fields", async () => {
    const { POST } = await import("./route");
    const res = await POST(makeRequest("test-secret"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("deleted");
    expect(body).toHaveProperty("cutoff");
  });

  it("cutoff is a string (ISO date) in the response", async () => {
    const { POST } = await import("./route");
    const res = await POST(makeRequest("test-secret"));
    const body = await res.json();
    expect(typeof body.cutoff).toBe("string");
    expect(body.cutoff.length).toBeGreaterThan(0);
  });

  it("secret comparison is case-sensitive", async () => {
    const { POST } = await import("./route");
    const res = await POST(makeRequest("TEST-SECRET"));
    expect(res.status).toBe(401);
  });

  it("401 body has error field", async () => {
    const { POST } = await import("./route");
    const res = await POST(makeRequest());
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });
});

describe("POST /api/cron/audit-purge — additional", () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    process.env = { ...OLD_ENV, CRON_SECRET: "test-secret" };

    const returningMock = vi.fn().mockResolvedValue([]);
    const whereMock = vi.fn().mockReturnValue({ returning: returningMock });
    mockDelete.mockReturnValue({ where: whereMock });
  });

  it("deleted property is a number in 200 response", async () => {
    const { POST } = await import("./route");
    const res = await POST(makeRequest("test-secret"));
    const body = await res.json();
    expect(typeof body.deleted).toBe("number");
  });

  it("db.delete called exactly once on valid request", async () => {
    const { POST } = await import("./route");
    await POST(makeRequest("test-secret"));
    expect(mockDelete).toHaveBeenCalledTimes(1);
  });

  it("401 body has error field for wrong secret", async () => {
    const { POST } = await import("./route");
    const res = await POST(makeRequest("bad-secret"));
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("deleted count matches number of deleted rows", async () => {
    const returningMock = vi.fn().mockResolvedValue([{ id: "r1" }, { id: "r2" }, { id: "r3" }]);
    const whereMock = vi.fn().mockReturnValue({ returning: returningMock });
    mockDelete.mockReturnValue({ where: whereMock });

    const { POST } = await import("./route");
    const res = await POST(makeRequest("test-secret"));
    const body = await res.json();
    expect(body.deleted).toBe(3);
  });

  it("cutoff date is in the past", async () => {
    const { POST } = await import("./route");
    const res = await POST(makeRequest("test-secret"));
    const body = await res.json();
    const cutoff = new Date(body.cutoff);
    expect(cutoff.getTime()).toBeLessThan(Date.now());
  });
});

describe("POST /api/cron/audit-purge — env handling", () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    process.env = { ...OLD_ENV, CRON_SECRET: "correct-secret" };

    const returningMock = vi.fn().mockResolvedValue([]);
    const whereMock = vi.fn().mockReturnValue({ returning: returningMock });
    mockDelete.mockReturnValue({ where: whereMock });
  });

  it("returns 401 when CRON_SECRET env is undefined", async () => {
    delete process.env.CRON_SECRET;
    const { POST } = await import("./route");
    const res = await POST(makeRequest("correct-secret"));
    expect(res.status).toBe(401);
  });

  it("succeeds when secret matches CRON_SECRET exactly", async () => {
    const { POST } = await import("./route");
    const res = await POST(makeRequest("correct-secret"));
    expect(res.status).toBe(200);
  });

  it("response is always a Response instance", async () => {
    const { POST } = await import("./route");
    const res = await POST(makeRequest());
    expect(res).toBeInstanceOf(Response);
  });

  it("200 response deleted field is non-negative", async () => {
    const { POST } = await import("./route");
    const res = await POST(makeRequest("correct-secret"));
    const body = await res.json();
    expect(body.deleted).toBeGreaterThanOrEqual(0);
  });
});

describe("POST /api/cron/audit-purge — response type invariants", () => {
  const OLD_ENV = process.env;
  beforeEach(() => { vi.clearAllMocks(); vi.resetModules(); process.env = { ...OLD_ENV, CRON_SECRET: "test-secret" }; });

  it("always returns a Response instance for valid secret", async () => {
    const { POST } = await import("./route");
    const res = await POST(makeRequest("test-secret"));
    expect(res).toBeInstanceOf(Response);
  });

  it("401 response is also a Response instance", async () => {
    const { POST } = await import("./route");
    const res = await POST(makeRequest("wrong-secret"));
    expect(res).toBeInstanceOf(Response);
    expect(res.status).toBe(401);
  });

  it("content-type is application/json for 200", async () => {
    const { POST } = await import("./route");
    const res = await POST(makeRequest("test-secret"));
    expect(res.headers.get("content-type")).toContain("application/json");
  });

  it("body is parseable JSON object for 200", async () => {
    const { POST } = await import("./route");
    const res = await POST(makeRequest("test-secret"));
    const body = await res.json();
    expect(typeof body).toBe("object");
    expect(body).not.toBeNull();
  });
});
