import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { tickOnceMock } = vi.hoisted(() => ({ tickOnceMock: vi.fn() }));

vi.mock("lib/agent-platform/worker", () => ({ tickOnce: tickOnceMock }));
vi.mock("logger", () => ({
  default: { withDefaults: () => ({ info: vi.fn(), error: vi.fn() }) },
}));

function makeRequest(secret?: string): NextRequest {
  const headers = new Headers();
  if (secret !== undefined) headers.set("x-asafe-cron-secret", secret);
  return {
    headers,
    nextUrl: new URL("http://localhost/api/hooks/agent-tick"),
  } as unknown as NextRequest;
}

describe("POST /api/hooks/agent-tick", () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    process.env = { ...OLD_ENV, ASAFE_CRON_SECRET: "tick-secret" };
    tickOnceMock.mockResolvedValue({ scheduled: 2, executed: 1, failed: 0 });
  });

  it("503 when ASAFE_CRON_SECRET is not configured", async () => {
    process.env.ASAFE_CRON_SECRET = "";
    const { POST } = await import("./route");
    const res = await POST(makeRequest("tick-secret"));
    expect(res.status).toBe(503);
    expect(tickOnceMock).not.toHaveBeenCalled();
  });

  it("401 without the secret header", async () => {
    const { POST } = await import("./route");
    const res = await POST(makeRequest());
    expect(res.status).toBe(401);
    expect(tickOnceMock).not.toHaveBeenCalled();
  });

  it("401 with a wrong secret", async () => {
    const { POST } = await import("./route");
    const res = await POST(makeRequest("wrong"));
    expect(res.status).toBe(401);
    expect(tickOnceMock).not.toHaveBeenCalled();
  });

  it("secret comparison is case-sensitive", async () => {
    const { POST } = await import("./route");
    const res = await POST(makeRequest("TICK-SECRET"));
    expect(res.status).toBe(401);
  });

  it("200 with the right secret — runs exactly one tick and returns counts", async () => {
    const { POST } = await import("./route");
    const res = await POST(makeRequest("tick-secret"));
    expect(res.status).toBe(200);
    expect(tickOnceMock).toHaveBeenCalledTimes(1);
    expect(await res.json()).toEqual({ scheduled: 2, executed: 1, failed: 0 });
  });

  it("counts in the body are numbers", async () => {
    const { POST } = await import("./route");
    const res = await POST(makeRequest("tick-secret"));
    const body = await res.json();
    expect(typeof body.scheduled).toBe("number");
    expect(typeof body.executed).toBe("number");
    expect(typeof body.failed).toBe("number");
  });
});
