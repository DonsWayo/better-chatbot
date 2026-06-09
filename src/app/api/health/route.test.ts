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

describe("GET /api/health — liveness", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns 200 status", async () => {
    const { GET } = await import("./route");
    const res = await GET(makeRequest("http://localhost:3001/api/health"));
    expect(res.status).toBe(200);
  });

  it("body status is 'ok'", async () => {
    const { GET } = await import("./route");
    const res = await GET(makeRequest("http://localhost:3001/api/health"));
    const body = await res.json();
    expect(body.status).toBe("ok");
  });

  it("includes uptime as a non-negative number", async () => {
    const { GET } = await import("./route");
    const res = await GET(makeRequest("http://localhost:3001/api/health"));
    const body = await res.json();
    expect(typeof body.uptime).toBe("number");
    expect(body.uptime).toBeGreaterThanOrEqual(0);
  });

  it("includes version field", async () => {
    const { GET } = await import("./route");
    const res = await GET(makeRequest("http://localhost:3001/api/health"));
    const body = await res.json();
    expect(body).toHaveProperty("version");
  });

  it("does not call DB for liveness check", async () => {
    const { GET } = await import("./route");
    await GET(makeRequest("http://localhost:3001/api/health"));
    expect(pgDbExecuteMock).not.toHaveBeenCalled();
  });

  it("does not include checks for liveness check", async () => {
    const { GET } = await import("./route");
    const res = await GET(makeRequest("http://localhost:3001/api/health"));
    const body = await res.json();
    expect(body.checks).toBeUndefined();
  });
});

describe("GET /api/health — readiness", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns 200 when DB responds", async () => {
    pgDbExecuteMock.mockResolvedValueOnce([]);
    const { GET } = await import("./route");
    const res = await GET(makeRequest("http://localhost:3001/api/health?ready"));
    expect(res.status).toBe(200);
  });

  it("status is ok when DB responds", async () => {
    pgDbExecuteMock.mockResolvedValueOnce([]);
    const { GET } = await import("./route");
    const res = await GET(makeRequest("http://localhost:3001/api/health?ready"));
    const body = await res.json();
    expect(body.status).toBe("ok");
  });

  it("checks.db is ok when DB responds", async () => {
    pgDbExecuteMock.mockResolvedValueOnce([]);
    const { GET } = await import("./route");
    const res = await GET(makeRequest("http://localhost:3001/api/health?ready"));
    const body = await res.json();
    expect(body.checks.db).toBe("ok");
  });

  it("calls DB for readiness check", async () => {
    pgDbExecuteMock.mockResolvedValueOnce([]);
    const { GET } = await import("./route");
    await GET(makeRequest("http://localhost:3001/api/health?ready"));
    expect(pgDbExecuteMock).toHaveBeenCalled();
  });

  it("returns 503 when DB is unreachable", async () => {
    pgDbExecuteMock.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    const { GET } = await import("./route");
    const res = await GET(makeRequest("http://localhost:3001/api/health?ready"));
    expect(res.status).toBe(503);
  });

  it("checks.db is error when DB fails", async () => {
    pgDbExecuteMock.mockRejectedValueOnce(new Error("connection timeout"));
    const { GET } = await import("./route");
    const res = await GET(makeRequest("http://localhost:3001/api/health?ready"));
    const body = await res.json();
    expect(body.checks.db).toBe("error");
  });

  it("status is error when DB fails", async () => {
    pgDbExecuteMock.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    const { GET } = await import("./route");
    const res = await GET(makeRequest("http://localhost:3001/api/health?ready"));
    const body = await res.json();
    expect(body.status).toBe("error");
  });

  it("includes version in readiness response", async () => {
    pgDbExecuteMock.mockResolvedValueOnce([]);
    const { GET } = await import("./route");
    const res = await GET(makeRequest("http://localhost:3001/api/health?ready"));
    const body = await res.json();
    expect(body).toHaveProperty("version");
  });
});

describe("GET /api/health — liveness additional", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("version is a string in liveness response", async () => {
    const { GET } = await import("./route");
    const res = await GET(makeRequest("http://localhost:3001/api/health"));
    const body = await res.json();
    expect(typeof body.version).toBe("string");
  });

  it("uptime is an integer (rounded) in liveness", async () => {
    const { GET } = await import("./route");
    const res = await GET(makeRequest("http://localhost:3001/api/health"));
    const body = await res.json();
    expect(Number.isInteger(body.uptime)).toBe(true);
  });

  it("liveness body has status, version, uptime keys", async () => {
    const { GET } = await import("./route");
    const res = await GET(makeRequest("http://localhost:3001/api/health"));
    const body = await res.json();
    expect(body).toHaveProperty("status");
    expect(body).toHaveProperty("version");
    expect(body).toHaveProperty("uptime");
  });

  it("pgDbExecute never called for non-ready request", async () => {
    const { GET } = await import("./route");
    await GET(makeRequest("http://localhost:3001/api/health"));
    expect(pgDbExecuteMock).toHaveBeenCalledTimes(0);
  });
});

describe("GET /api/health — readiness additional", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("pgDbExecute called exactly once for readiness", async () => {
    pgDbExecuteMock.mockResolvedValueOnce([]);
    const { GET } = await import("./route");
    await GET(makeRequest("http://localhost:3001/api/health?ready"));
    expect(pgDbExecuteMock).toHaveBeenCalledTimes(1);
  });

  it("503 body has version field", async () => {
    pgDbExecuteMock.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    const { GET } = await import("./route");
    const res = await GET(makeRequest("http://localhost:3001/api/health?ready"));
    const body = await res.json();
    expect(body).toHaveProperty("version");
  });

  it("503 body has checks.db property", async () => {
    pgDbExecuteMock.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    const { GET } = await import("./route");
    const res = await GET(makeRequest("http://localhost:3001/api/health?ready"));
    const body = await res.json();
    expect(body.checks).toHaveProperty("db");
  });

  it("readiness version is a string", async () => {
    pgDbExecuteMock.mockResolvedValueOnce([]);
    const { GET } = await import("./route");
    const res = await GET(makeRequest("http://localhost:3001/api/health?ready"));
    const body = await res.json();
    expect(typeof body.version).toBe("string");
  });

  it("readiness body has status, version, checks fields", async () => {
    pgDbExecuteMock.mockResolvedValueOnce([]);
    const { GET } = await import("./route");
    const res = await GET(makeRequest("http://localhost:3001/api/health?ready"));
    const body = await res.json();
    expect(body).toHaveProperty("status");
    expect(body).toHaveProperty("version");
    expect(body).toHaveProperty("checks");
  });
});

describe("GET /api/health — response invariants", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("liveness is always a Response instance", async () => {
    const { GET } = await import("./route");
    const res = await GET(makeRequest("http://localhost:3001/api/health"));
    expect(res).toBeInstanceOf(Response);
  });

  it("readiness is a Response instance on DB success", async () => {
    pgDbExecuteMock.mockResolvedValueOnce([]);
    const { GET } = await import("./route");
    const res = await GET(makeRequest("http://localhost:3001/api/health?ready"));
    expect(res).toBeInstanceOf(Response);
  });

  it("readiness is a Response instance on DB failure", async () => {
    pgDbExecuteMock.mockRejectedValueOnce(new Error("DB down"));
    const { GET } = await import("./route");
    const res = await GET(makeRequest("http://localhost:3001/api/health?ready"));
    expect(res).toBeInstanceOf(Response);
  });

  it("status field is always a string", async () => {
    const { GET } = await import("./route");
    const res = await GET(makeRequest("http://localhost:3001/api/health"));
    const body = await res.json();
    expect(typeof body.status).toBe("string");
  });
});

describe("GET /api/health — edge cases", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("liveness status is always exactly 'ok'", async () => {
    const { GET } = await import("./route");
    const res = await GET(makeRequest("http://localhost:3001/api/health"));
    const body = await res.json();
    expect(body.status).toBe("ok");
  });

  it("readiness DB called exactly once when ?ready param present", async () => {
    pgDbExecuteMock.mockResolvedValueOnce([]);
    const { GET } = await import("./route");
    const res = await GET(makeRequest("http://localhost:3001/api/health?ready"));
    expect(pgDbExecuteMock).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(200);
  });

  it("503 body status is 'error' not 'fail'", async () => {
    pgDbExecuteMock.mockRejectedValueOnce(new Error("timeout"));
    const { GET } = await import("./route");
    const res = await GET(makeRequest("http://localhost:3001/api/health?ready"));
    const body = await res.json();
    expect(body.status).toBe("error");
  });

  it("liveness returns 200 without querying DB", async () => {
    const { GET } = await import("./route");
    const res = await GET(makeRequest("http://localhost:3001/api/health"));
    expect(res.status).toBe(200);
    expect(pgDbExecuteMock).not.toHaveBeenCalled();
  });
});
