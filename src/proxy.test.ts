import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the better-auth cookie reader so we can simulate no-session requests.
const getSessionCookie = vi.fn();
vi.mock("better-auth/cookies", () => ({
  getSessionCookie: () => getSessionCookie(),
}));

import { proxy } from "./proxy";

const req = (path: string) =>
  new NextRequest(new URL(`http://localhost:3005${path}`));

describe("proxy gate", () => {
  beforeEach(() => {
    getSessionCookie.mockReset();
  });

  it("lets /api/v1 through to its own Bearer auth even with no session cookie", async () => {
    // Regression guard: the public programmatic API authenticates with an
    // Authorization: Bearer ck_live_... key, NOT a session cookie. If the proxy
    // 401s it on the missing cookie, every external API-key caller is blocked
    // before the route's authenticateApiKey runs.
    getSessionCookie.mockReturnValue(null);
    const res = await proxy(req("/api/v1/agents"));
    // NextResponse.next() carries the special middleware "next" header and is
    // NOT a 401 — assert we did not short-circuit.
    expect(res.status).not.toBe(401);
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });

  it("still 401s other /api routes with no session cookie", async () => {
    getSessionCookie.mockReturnValue(null);
    const res = await proxy(req("/api/thread"));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  it("redirects non-api pages to /sign-in with no session cookie", async () => {
    getSessionCookie.mockReturnValue(null);
    const res = await proxy(req("/chat"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/sign-in");
  });

  it("passes through authenticated requests", async () => {
    getSessionCookie.mockReturnValue("session-token");
    const res = await proxy(req("/api/thread"));
    expect(res.status).not.toBe(401);
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });
});
