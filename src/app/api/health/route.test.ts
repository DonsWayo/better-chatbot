import { describe, it, expect, vi, beforeEach } from "vitest";

const { pgDbExecuteMock } = vi.hoisted(() => ({
  pgDbExecuteMock: vi.fn(),
}));

vi.mock("lib/db/pg/db.pg", () => ({
  pgDb: { execute: pgDbExecuteMock },
}));
vi.mock("drizzle-orm", () => ({
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ query: strings.join(""), values }),
}));

function makeRequest(url: string): Request {
  return { url } as unknown as Request;
}

describe("GET /api/health", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns liveness ok without DB check", async () => {
    const { GET } = await import("./route");
    const res = await GET(makeRequest("http://localhost:3001/api/health"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.uptime).toBeGreaterThanOrEqual(0);
    expect(pgDbExecuteMock).not.toHaveBeenCalled();
  });

  it("returns readiness ok when DB responds", async () => {
    pgDbExecuteMock.mockResolvedValueOnce([]);
    const { GET } = await import("./route");
    const res = await GET(makeRequest("http://localhost:3001/api/health?ready"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.checks.db).toBe("ok");
  });

  it("returns 503 when DB is unreachable", async () => {
    pgDbExecuteMock.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    const { GET } = await import("./route");
    const res = await GET(makeRequest("http://localhost:3001/api/health?ready"));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.checks.db).toBe("error");
  });
});
