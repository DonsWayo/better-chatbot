import { describe, it, expect, vi, beforeEach } from "vitest";

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
    headers: { get: (name: string) => (name === "authorization" ? (authHeader ?? null) : null) },
  } as unknown as Request;
}

describe("GET /api/metrics", () => {
  beforeEach(() => { vi.clearAllMocks(); vi.unstubAllEnvs(); });

  it("returns metrics when no token is configured", async () => {
    delete process.env.METRICS_AUTH_TOKEN;
    const { GET } = await import("./route");
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    expect(ensureMetricsMock).toHaveBeenCalled();
  });

  it("returns 401 when token is required but missing", async () => {
    process.env.METRICS_AUTH_TOKEN = "secret123";
    const { GET } = await import("./route");
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it("returns metrics when correct bearer token provided", async () => {
    process.env.METRICS_AUTH_TOKEN = "secret123";
    const { GET } = await import("./route");
    const res = await GET(makeRequest("Bearer secret123"));
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("process_uptime");
  });
});
