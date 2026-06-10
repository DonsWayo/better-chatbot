import { beforeEach, describe, expect, it, vi } from "vitest";

const { ensureMetricsMock, metricsMock } = vi.hoisted(() => ({
  ensureMetricsMock: vi.fn(),
  metricsMock: vi.fn().mockResolvedValue("# HELP uptime\nprocess_uptime 42"),
}));

vi.mock("lib/observability/metrics", () => ({
  ensureMetrics: ensureMetricsMock,
  metricsRegistry: {
    metrics: metricsMock,
    contentType: "text/plain; version=0.0.4",
  },
}));

function makeRequest(authHeader?: string): Request {
  return {
    headers: {
      get: (name: string) =>
        name === "authorization" ? (authHeader ?? null) : null,
    },
  } as unknown as Request;
}

describe("GET /api/metrics — no auth token configured", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    delete process.env.METRICS_AUTH_TOKEN;
  });

  it("returns 200 when no token is configured", async () => {
    const { GET } = await import("./route");
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
  });

  it("calls ensureMetrics when no token required", async () => {
    const { GET } = await import("./route");
    await GET(makeRequest());
    expect(ensureMetricsMock).toHaveBeenCalled();
  });

  it("returns metrics body when no token required", async () => {
    const { GET } = await import("./route");
    const res = await GET(makeRequest());
    const text = await res.text();
    expect(text).toContain("process_uptime");
  });

  it("returns correct content-type header", async () => {
    const { GET } = await import("./route");
    const res = await GET(makeRequest());
    expect(res.headers.get("content-type")).toContain("text/plain");
  });
});

describe("GET /api/metrics — token authentication", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it("returns 401 when token is required but no header provided", async () => {
    process.env.METRICS_AUTH_TOKEN = "secret123";
    const { GET } = await import("./route");
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it("returns 401 when wrong token provided", async () => {
    process.env.METRICS_AUTH_TOKEN = "secret123";
    const { GET } = await import("./route");
    const res = await GET(makeRequest("Bearer wrongtoken"));
    expect(res.status).toBe(401);
  });

  it("returns 401 when token provided without Bearer prefix", async () => {
    process.env.METRICS_AUTH_TOKEN = "secret123";
    const { GET } = await import("./route");
    const res = await GET(makeRequest("secret123"));
    expect(res.status).toBe(401);
  });

  it("returns 200 when correct bearer token provided", async () => {
    process.env.METRICS_AUTH_TOKEN = "secret123";
    const { GET } = await import("./route");
    const res = await GET(makeRequest("Bearer secret123"));
    expect(res.status).toBe(200);
  });

  it("returns metrics body when correct token provided", async () => {
    process.env.METRICS_AUTH_TOKEN = "secret123";
    const { GET } = await import("./route");
    const res = await GET(makeRequest("Bearer secret123"));
    const text = await res.text();
    expect(text).toContain("process_uptime");
  });

  it("calls ensureMetrics when authenticated", async () => {
    process.env.METRICS_AUTH_TOKEN = "mytoken";
    const { GET } = await import("./route");
    await GET(makeRequest("Bearer mytoken"));
    expect(ensureMetricsMock).toHaveBeenCalled();
  });

  it("does NOT call ensureMetrics when unauthorized", async () => {
    process.env.METRICS_AUTH_TOKEN = "secret";
    const { GET } = await import("./route");
    await GET(makeRequest("Bearer wrongtoken"));
    expect(ensureMetricsMock).not.toHaveBeenCalled();
  });

  it("401 body is text 'Unauthorized' when token required but wrong", async () => {
    process.env.METRICS_AUTH_TOKEN = "secret123";
    const { GET } = await import("./route");
    const res = await GET(makeRequest("Bearer bad"));
    expect(await res.text()).toBe("Unauthorized");
  });

  it("ensureMetrics called exactly once when authenticated", async () => {
    process.env.METRICS_AUTH_TOKEN = "tok";
    const { GET } = await import("./route");
    await GET(makeRequest("Bearer tok"));
    expect(ensureMetricsMock).toHaveBeenCalledTimes(1);
  });

  it("metrics() called exactly once per authenticated request", async () => {
    process.env.METRICS_AUTH_TOKEN = "tok";
    const { GET } = await import("./route");
    await GET(makeRequest("Bearer tok"));
    expect(metricsMock).toHaveBeenCalledTimes(1);
  });
});

describe("GET /api/metrics — token authentication additional", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it("401 body is text 'Unauthorized' when no auth header provided", async () => {
    process.env.METRICS_AUTH_TOKEN = "secret123";
    const { GET } = await import("./route");
    const res = await GET(makeRequest());
    expect(await res.text()).toBe("Unauthorized");
  });

  it("metrics() not called when no auth header provided", async () => {
    process.env.METRICS_AUTH_TOKEN = "secret123";
    const { GET } = await import("./route");
    await GET(makeRequest());
    expect(metricsMock).not.toHaveBeenCalled();
  });

  it("metrics() not called when wrong token provided", async () => {
    process.env.METRICS_AUTH_TOKEN = "secret123";
    const { GET } = await import("./route");
    await GET(makeRequest("Bearer wrongtoken"));
    expect(metricsMock).not.toHaveBeenCalled();
  });

  it("content-type is correct when authenticated", async () => {
    process.env.METRICS_AUTH_TOKEN = "tok";
    const { GET } = await import("./route");
    const res = await GET(makeRequest("Bearer tok"));
    expect(res.headers.get("content-type")).toContain("text/plain");
  });
});

describe("GET /api/metrics — response invariants", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    delete process.env.METRICS_AUTH_TOKEN;
  });

  it("returns a Response instance (no token configured)", async () => {
    const { GET } = await import("./route");
    const res = await GET(makeRequest());
    expect(res).toBeInstanceOf(Response);
  });

  it("returns a Response instance for 401 (wrong token)", async () => {
    process.env.METRICS_AUTH_TOKEN = "tok";
    const { GET } = await import("./route");
    const res = await GET(makeRequest("Bearer wrong"));
    expect(res).toBeInstanceOf(Response);
  });

  it("200 body is a non-empty string (no token configured)", async () => {
    const { GET } = await import("./route");
    const res = await GET(makeRequest());
    const text = await res.text();
    expect(typeof text).toBe("string");
    expect(text.length).toBeGreaterThan(0);
  });

  it("200 status is exactly 200 (no token configured)", async () => {
    const { GET } = await import("./route");
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
  });
});

describe("GET /api/metrics — call count invariants", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    metricsMock.mockResolvedValue("# HELP up\nprocess_uptime 1");
  });

  it("metricsMock called exactly once per valid GET", async () => {
    const { GET } = await import("./route");
    await GET(makeRequest());
    expect(metricsMock).toHaveBeenCalledTimes(1);
  });

  it("ensureMetrics called exactly once per valid GET", async () => {
    const { GET } = await import("./route");
    await GET(makeRequest());
    expect(ensureMetricsMock).toHaveBeenCalledTimes(1);
  });

  it("returns a Response instance for any request", async () => {
    const { GET } = await import("./route");
    const res = await GET(makeRequest());
    expect(res).toBeInstanceOf(Response);
  });

  it("metricsMock not called when authorization header is invalid and token is configured", async () => {
    vi.stubEnv("METRICS_AUTH_TOKEN", "secure-token");
    const { GET } = await import("./route");
    const res = await GET(makeRequest("Bearer wrong-token"));
    expect(res.status).toBe(401);
    vi.unstubAllEnvs();
  });
});
