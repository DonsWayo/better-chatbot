/**
 * Integration tests for the shared requirePrincipal / apiError / apiOk helpers
 * that guard every /api/v1 route. These test the auth + rate-limit contract in
 * isolation so each route test can focus on its own business logic.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { authenticateApiKeyMock, hasScopeMock, checkRateLimitMock } = vi.hoisted(
  () => ({
    authenticateApiKeyMock: vi.fn(),
    hasScopeMock: vi.fn(),
    checkRateLimitMock: vi.fn(),
  }),
);

vi.mock("lib/auth/api-key-auth", () => ({
  authenticateApiKey: authenticateApiKeyMock,
  hasScope: hasScopeMock,
}));
vi.mock("lib/rate-limit", () => ({
  checkRateLimit: checkRateLimitMock,
}));

import { apiError, apiOk, requirePrincipal } from "./respond";

const PRINCIPAL = {
  userId: "u1",
  teamId: "t1",
  role: "editor",
  keyId: "k1",
  scopes: ["*"],
};

function makeReq(auth?: string): Request {
  const headers: Record<string, string> = {};
  if (auth !== undefined) headers["authorization"] = auth;
  return new Request("https://x/api/v1/sessions", { headers });
}

beforeEach(() => {
  vi.clearAllMocks();
  hasScopeMock.mockReturnValue(true);
  authenticateApiKeyMock.mockResolvedValue(PRINCIPAL);
  checkRateLimitMock.mockResolvedValue({
    allowed: true,
    limit: 60,
    remaining: 59,
    resetAt: Date.now() + 60_000,
  });
});

// ─── apiError helper ─────────────────────────────────────────────────────────

describe("apiError", () => {
  it("returns 401 for unauthorized code", async () => {
    const res = apiError("unauthorized", "Missing key");
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json).toEqual({
      error: { code: "unauthorized", message: "Missing key" },
    });
  });

  it("returns 403 for forbidden code", async () => {
    const res = apiError("forbidden", "No scope");
    expect(res.status).toBe(403);
  });

  it("returns 404 for not_found code", async () => {
    const res = apiError("not_found", "Gone");
    expect(res.status).toBe(404);
  });

  it("returns 400 for invalid_request code", async () => {
    const res = apiError("invalid_request", "Bad body");
    expect(res.status).toBe(400);
  });

  it("returns 402 for budget_exhausted code", async () => {
    const res = apiError("budget_exhausted", "Budget gone");
    expect(res.status).toBe(402);
  });

  it("returns 500 for internal_error code", async () => {
    const res = apiError("internal_error", "Oops");
    expect(res.status).toBe(500);
  });

  it("respects an explicit status override", async () => {
    const res = apiError("invalid_request", "Too large", 413);
    expect(res.status).toBe(413);
  });
});

// ─── apiOk helper ────────────────────────────────────────────────────────────

describe("apiOk", () => {
  it("defaults to status 200", async () => {
    const res = apiOk({ hello: "world" });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ hello: "world" });
  });

  it("uses the provided status code", async () => {
    const res = apiOk({ sessionId: "s1" }, 202);
    expect(res.status).toBe(202);
  });
});

// ─── requirePrincipal ────────────────────────────────────────────────────────

describe("requirePrincipal", () => {
  it("returns 401 when Authorization header is absent", async () => {
    authenticateApiKeyMock.mockResolvedValueOnce(null);
    const result = await requirePrincipal(makeReq());
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(401);
    const json = await (result as Response).json();
    expect(json.error.code).toBe("unauthorized");
    expect(json.error.message).toContain("Bearer ck_live_");
  });

  it("returns 401 for a malformed Authorization header (no Bearer scheme)", async () => {
    authenticateApiKeyMock.mockResolvedValueOnce(null);
    const result = await requirePrincipal(makeReq("Token abc"));
    expect((result as Response).status).toBe(401);
  });

  it("returns 401 for an invalid/revoked API key", async () => {
    authenticateApiKeyMock.mockResolvedValueOnce(null);
    const result = await requirePrincipal(makeReq("Bearer ck_live_revoked"));
    expect((result as Response).status).toBe(401);
  });

  it("returns the principal when key is valid and no scope is required", async () => {
    const result = await requirePrincipal(makeReq("Bearer ck_live_x"));
    expect(result).toEqual(PRINCIPAL);
  });

  it("returns the principal when key has the required scope", async () => {
    hasScopeMock.mockReturnValue(true);
    const result = await requirePrincipal(
      makeReq("Bearer ck_live_x"),
      "sessions:read",
    );
    expect(result).toEqual(PRINCIPAL);
  });

  it("returns 403 when the key lacks the required scope", async () => {
    hasScopeMock.mockReturnValue(false);
    const result = await requirePrincipal(
      makeReq("Bearer ck_live_x"),
      "sessions:read",
    );
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(403);
    const json = await (result as Response).json();
    expect(json.error.code).toBe("forbidden");
    expect(json.error.message).toContain("sessions:read");
  });

  it("does NOT check rate limit for read scopes", async () => {
    await requirePrincipal(makeReq("Bearer ck_live_x"), "sessions:read");
    expect(checkRateLimitMock).not.toHaveBeenCalled();
  });

  it("does NOT check rate limit when no scope is provided", async () => {
    await requirePrincipal(makeReq("Bearer ck_live_x"));
    expect(checkRateLimitMock).not.toHaveBeenCalled();
  });

  it("checks rate limit for write scopes", async () => {
    await requirePrincipal(makeReq("Bearer ck_live_x"), "sessions:write");
    expect(checkRateLimitMock).toHaveBeenCalledWith("u1");
  });

  it("returns 429 when write rate limit is exceeded", async () => {
    const resetAt = Date.now() + 30_000;
    checkRateLimitMock.mockResolvedValueOnce({
      allowed: false,
      limit: 60,
      remaining: 0,
      resetAt,
    });
    const result = await requirePrincipal(
      makeReq("Bearer ck_live_x"),
      "sessions:write",
    );
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(429);
    const json = await (result as Response).json();
    expect(json.error.code).toBe("rate_limited");
    expect(json.error.retryAfter).toBeGreaterThan(0);
  });

  it("429 response includes all required rate-limit headers", async () => {
    const resetAt = Date.now() + 45_000;
    checkRateLimitMock.mockResolvedValueOnce({
      allowed: false,
      limit: 60,
      remaining: 0,
      resetAt,
    });
    const result = await requirePrincipal(
      makeReq("Bearer ck_live_x"),
      "sessions:write",
    );
    const res = result as Response;
    expect(res.headers.get("X-RateLimit-Limit")).toBe("60");
    expect(res.headers.get("X-RateLimit-Remaining")).toBe("0");
    expect(res.headers.get("X-RateLimit-Reset")).toBeTruthy();
    expect(Number(res.headers.get("Retry-After"))).toBeGreaterThan(0);
  });

  it("fails open (allows request) when rate-limit DB throws", async () => {
    checkRateLimitMock.mockRejectedValueOnce(new Error("DB down"));
    const result = await requirePrincipal(
      makeReq("Bearer ck_live_x"),
      "sessions:write",
    );
    // Should still return principal (fail open)
    expect(result).toEqual(PRINCIPAL);
  });

  it("checks rate limit with the correct userId from the principal", async () => {
    const otherPrincipal = { ...PRINCIPAL, userId: "u99" };
    authenticateApiKeyMock.mockResolvedValueOnce(otherPrincipal);
    await requirePrincipal(makeReq("Bearer ck_live_x"), "agents:write");
    expect(checkRateLimitMock).toHaveBeenCalledWith("u99");
  });
});
