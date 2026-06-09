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
});
