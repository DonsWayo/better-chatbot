import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// prom-client needs a fresh registry per test file to avoid duplicate metric errors
vi.mock("prom-client", () => {
  const inc = vi.fn();
  const observe = vi.fn();
  const set = vi.fn();
  const dec = vi.fn();
  const mockCounter = vi.fn(() => ({ inc }));
  const mockHistogram = vi.fn(() => ({ observe }));
  const mockGauge = vi.fn(() => ({ set, inc, dec }));
  return { Counter: mockCounter, Histogram: mockHistogram, Gauge: mockGauge };
});

vi.mock("./metrics", () => ({ metricsRegistry: {} }));

import {
  activeRequests,
  killSwitchActivations,
  providerErrorsTotal,
  providerFallbackTotal,
  rateLimitActivations,
  ttftMs,
} from "./slo";

describe("SLO metrics — shape", () => {
  it("ttftMs is a Histogram with observe()", () => {
    expect(typeof ttftMs.observe).toBe("function");
  });

  it("providerErrorsTotal is a Counter with inc()", () => {
    expect(typeof providerErrorsTotal.inc).toBe("function");
  });

  it("providerFallbackTotal is a Counter with inc()", () => {
    expect(typeof providerFallbackTotal.inc).toBe("function");
  });

  it("activeRequests is a Gauge with inc() and dec()", () => {
    expect(typeof activeRequests.inc).toBe("function");
    expect(typeof activeRequests.dec).toBe("function");
  });

  it("killSwitchActivations is a Counter with inc()", () => {
    expect(typeof killSwitchActivations.inc).toBe("function");
  });

  it("rateLimitActivations is a Counter with inc()", () => {
    expect(typeof rateLimitActivations.inc).toBe("function");
  });
});

describe("SLO metrics — behaviour", () => {
  it("ttftMs.observe() can be called with labels", () => {
    expect(() =>
      ttftMs.observe(
        { provider: "openrouter", model: "gpt-4o", task_class: "chat" },
        350,
      ),
    ).not.toThrow();
  });

  it("activeRequests.inc() and dec() both callable", () => {
    expect(() => activeRequests.inc()).not.toThrow();
    expect(() => activeRequests.dec()).not.toThrow();
  });

  it("providerErrorsTotal.inc() callable with labels", () => {
    expect(() =>
      providerErrorsTotal.inc({
        provider: "openrouter",
        model: "gpt-4o",
        error_type: "timeout",
      }),
    ).not.toThrow();
  });

  it("killSwitchActivations.inc() callable without labels", () => {
    expect(() => killSwitchActivations.inc()).not.toThrow();
  });

  it("rateLimitActivations.inc() callable with team_id label", () => {
    expect(() => rateLimitActivations.inc({ team_id: "team-1" })).not.toThrow();
  });

  it("activeRequests.set() callable with numeric value", () => {
    expect(() => activeRequests.set(0)).not.toThrow();
  });

  it("providerFallbackTotal.inc() callable with fallback labels", () => {
    expect(() =>
      providerFallbackTotal.inc({
        primary_provider: "anthropic",
        fallback_provider: "openai",
        fallback_model: "gpt-5.5",
      }),
    ).not.toThrow();
  });

  it("ttftMs.observe() accepts multiple different latencies", () => {
    const labels = {
      provider: "openrouter",
      model: "gpt-5.5",
      task_class: "code",
    };
    expect(() => ttftMs.observe(labels, 100)).not.toThrow();
    expect(() => ttftMs.observe(labels, 2000)).not.toThrow();
  });
});

describe("SLO metrics — all exports are defined", () => {
  it("ttftMs is defined", () => {
    expect(ttftMs).toBeDefined();
  });

  it("providerErrorsTotal is defined", () => {
    expect(providerErrorsTotal).toBeDefined();
  });

  it("providerFallbackTotal is defined", () => {
    expect(providerFallbackTotal).toBeDefined();
  });

  it("activeRequests is defined", () => {
    expect(activeRequests).toBeDefined();
  });

  it("killSwitchActivations is defined", () => {
    expect(killSwitchActivations).toBeDefined();
  });

  it("rateLimitActivations is defined", () => {
    expect(rateLimitActivations).toBeDefined();
  });

  it("Counters do NOT have observe() (they are not histograms)", () => {
    expect((providerErrorsTotal as any).observe).toBeUndefined();
    expect((killSwitchActivations as any).observe).toBeUndefined();
  });

  it("Histogram does NOT have inc() directly (it is not a counter)", () => {
    expect((ttftMs as any).inc).toBeUndefined();
  });
});
