import { describe, it, expect, vi, beforeEach } from "vitest";

// collectDefaultMetrics needs mock to avoid prom-client process metrics side effects
vi.mock("prom-client", () => {
  const makeCollector = () => ({
    inc: vi.fn(),
    set: vi.fn(),
    observe: vi.fn(),
    labels: vi.fn().mockReturnThis(),
  });
  const Registry = vi.fn().mockImplementation(() => ({
    registerMetric: vi.fn(),
    metrics: vi.fn().mockResolvedValue(""),
    getMetricsAsJSON: vi.fn().mockReturnValue([]),
    contentType: "text/plain",
  }));
  return {
    Registry,
    Counter: vi.fn().mockImplementation(() => makeCollector()),
    Gauge: vi.fn().mockImplementation(() => makeCollector()),
    Histogram: vi.fn().mockImplementation(() => makeCollector()),
    collectDefaultMetrics: vi.fn(),
  };
});

describe("metrics module", () => {
  it("exports a metricsRegistry", async () => {
    const { metricsRegistry } = await import("./metrics");
    expect(metricsRegistry).toBeDefined();
  });

  it("exports chatRequestsTotal counter", async () => {
    const { chatRequestsTotal } = await import("./metrics");
    expect(chatRequestsTotal).toBeDefined();
  });

  it("exports routingDecisionsTotal counter", async () => {
    const { routingDecisionsTotal } = await import("./metrics");
    expect(routingDecisionsTotal).toBeDefined();
  });

  it("exports chatLatencyMs histogram", async () => {
    const { chatLatencyMs } = await import("./metrics");
    expect(chatLatencyMs).toBeDefined();
  });

  it("exports chatErrorsTotal counter", async () => {
    const { chatErrorsTotal } = await import("./metrics");
    expect(chatErrorsTotal).toBeDefined();
  });

  it("exports budgetUtilizationGauge gauge", async () => {
    const { budgetUtilizationGauge } = await import("./metrics");
    expect(budgetUtilizationGauge).toBeDefined();
  });

  it("exports guardrailFiringsTotal counter", async () => {
    const { guardrailFiringsTotal } = await import("./metrics");
    expect(guardrailFiringsTotal).toBeDefined();
  });

  it("exports guardrailBlocksTotal counter", async () => {
    const { guardrailBlocksTotal } = await import("./metrics");
    expect(guardrailBlocksTotal).toBeDefined();
  });

  it("exports appInfo gauge", async () => {
    const { appInfo } = await import("./metrics");
    expect(appInfo).toBeDefined();
  });

  it("ensureMetrics returns the registry", async () => {
    const { ensureMetrics, metricsRegistry } = await import("./metrics");
    const registry = ensureMetrics();
    expect(registry).toBe(metricsRegistry);
  });

  it("ensureMetrics is idempotent (second call returns same registry)", async () => {
    const { ensureMetrics, metricsRegistry } = await import("./metrics");
    const r1 = ensureMetrics();
    const r2 = ensureMetrics();
    expect(r1).toBe(r2);
    expect(r1).toBe(metricsRegistry);
  });

  it("chatRequestsTotal has inc() method", async () => {
    const { chatRequestsTotal } = await import("./metrics");
    expect(typeof chatRequestsTotal.inc).toBe("function");
  });

  it("routingDecisionsTotal has inc() method", async () => {
    const { routingDecisionsTotal } = await import("./metrics");
    expect(typeof routingDecisionsTotal.inc).toBe("function");
  });

  it("chatLatencyMs has observe() method", async () => {
    const { chatLatencyMs } = await import("./metrics");
    expect(typeof chatLatencyMs.observe).toBe("function");
  });

  it("budgetUtilizationGauge has set() method", async () => {
    const { budgetUtilizationGauge } = await import("./metrics");
    expect(typeof budgetUtilizationGauge.set).toBe("function");
  });

  it("guardrailFiringsTotal has labels() method", async () => {
    const { guardrailFiringsTotal } = await import("./metrics");
    expect(typeof guardrailFiringsTotal.labels).toBe("function");
  });

  it("guardrailBlocksTotal is callable with inc()", async () => {
    const { guardrailBlocksTotal } = await import("./metrics");
    expect(() => guardrailBlocksTotal.inc()).not.toThrow();
  });

  it("chatErrorsTotal is callable with inc()", async () => {
    const { chatErrorsTotal } = await import("./metrics");
    expect(() => chatErrorsTotal.inc()).not.toThrow();
  });
});
