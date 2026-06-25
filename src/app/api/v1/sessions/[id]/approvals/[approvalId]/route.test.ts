import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  authenticateApiKeyMock,
  hasScopeMock,
  checkRateLimitMock,
  getSessionMock,
  getApprovalWithSessionMock,
  canDecideMock,
  decideApprovalMock,
} = vi.hoisted(() => ({
  authenticateApiKeyMock: vi.fn(),
  hasScopeMock: vi.fn(),
  checkRateLimitMock: vi.fn(),
  getSessionMock: vi.fn(),
  getApprovalWithSessionMock: vi.fn(),
  canDecideMock: vi.fn(),
  decideApprovalMock: vi.fn(),
}));

vi.mock("lib/auth/api-key-auth", () => ({
  authenticateApiKey: authenticateApiKeyMock,
  hasScope: hasScopeMock,
}));
vi.mock("lib/rate-limit", () => ({
  checkRateLimit: checkRateLimitMock,
}));
vi.mock("lib/agent-platform/sessions", () => ({
  getSession: getSessionMock,
}));
vi.mock("lib/agent-platform/approvals", () => ({
  getApprovalWithSession: getApprovalWithSessionMock,
  canDecide: canDecideMock,
  decideApproval: decideApprovalMock,
}));

import { POST } from "./route";

const PRINCIPAL = {
  userId: "u1",
  teamId: "t1",
  role: "editor",
  keyId: "k1",
  scopes: ["*"],
};

const params = Promise.resolve({ id: "s1", approvalId: "apr1" });

function postReq(body: unknown, auth = "Bearer ck_live_x"): Request {
  return new Request("https://x/api/v1/sessions/s1/approvals/apr1", {
    method: "POST",
    headers: { authorization: auth, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function ownedSession(overrides = {}) {
  return { id: "s1", userId: "u1", status: "awaiting_approval", ...overrides };
}

function pendingApproval(overrides = {}) {
  return {
    request: {
      id: "apr1",
      status: "pending",
      requestedRole: "owner",
      ...overrides,
    },
    session: { id: "s1", userId: "u1", teamId: "t1" },
  };
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
  getSessionMock.mockResolvedValue(ownedSession());
  getApprovalWithSessionMock.mockResolvedValue(pendingApproval());
  canDecideMock.mockResolvedValue(true);
  decideApprovalMock.mockResolvedValue({ id: "apr1", status: "approved" });
});

describe("POST /api/v1/sessions/[id]/approvals/[approvalId]", () => {
  it("401 without a valid key", async () => {
    authenticateApiKeyMock.mockResolvedValueOnce(null);
    const res = await POST(postReq({ approve: true }), { params });
    expect(res.status).toBe(401);
  });

  it("403 when the key lacks sessions:write scope", async () => {
    hasScopeMock.mockReturnValue(false);
    const res = await POST(postReq({ approve: true }), { params });
    expect(res.status).toBe(403);
  });

  it("429 when the write rate limit is exceeded", async () => {
    const resetAt = Date.now() + 45_000;
    checkRateLimitMock.mockResolvedValueOnce({
      allowed: false,
      limit: 60,
      remaining: 0,
      resetAt,
    });
    const res = await POST(postReq({ approve: true }), { params });
    expect(res.status).toBe(429);
    const json = await res.json();
    expect(json.error.code).toBe("rate_limited");
    expect(json.error.retryAfter).toBeGreaterThan(0);
  });

  it("rate limit 429 includes X-RateLimit-Remaining and Retry-After headers", async () => {
    const resetAt = Date.now() + 30_000;
    checkRateLimitMock.mockResolvedValueOnce({
      allowed: false,
      limit: 60,
      remaining: 0,
      resetAt,
    });
    const res = await POST(postReq({ approve: true }), { params });
    expect(res.headers.get("X-RateLimit-Remaining")).toBe("0");
    expect(res.headers.get("X-RateLimit-Limit")).toBe("60");
    expect(Number(res.headers.get("Retry-After"))).toBeGreaterThan(0);
  });

  it("404 when the session is not found or not owned by the principal", async () => {
    getSessionMock.mockResolvedValueOnce({ id: "s1", userId: "ATTACKER" });
    const res = await POST(postReq({ approve: true }), { params });
    expect(res.status).toBe(404);
  });

  it("404 when the approval does not exist", async () => {
    getApprovalWithSessionMock.mockResolvedValueOnce(null);
    const res = await POST(postReq({ approve: true }), { params });
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error.message).toContain("Approval");
  });

  it("404 when the approval belongs to a different session", async () => {
    getApprovalWithSessionMock.mockResolvedValueOnce({
      ...pendingApproval(),
      session: { id: "OTHER_SESSION", userId: "u1", teamId: "t1" },
    });
    const res = await POST(postReq({ approve: true }), { params });
    expect(res.status).toBe(404);
  });

  it("400 when the approval is already decided (not pending)", async () => {
    getApprovalWithSessionMock.mockResolvedValueOnce({
      ...pendingApproval({ status: "approved" }),
    });
    const res = await POST(postReq({ approve: true }), { params });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.message).toContain("already decided");
  });

  it("400 when request body is invalid JSON", async () => {
    const req = new Request("https://x/api/v1/sessions/s1/approvals/apr1", {
      method: "POST",
      headers: {
        authorization: "Bearer ck_live_x",
        "content-type": "application/json",
      },
      body: "not-json",
    });
    const res = await POST(req, { params });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.code).toBe("invalid_request");
  });

  it("400 when `approve` field is missing from body", async () => {
    const res = await POST(postReq({ reason: "just because" }), { params });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.message).toContain("`approve`");
  });

  it("400 when `approve` is a string instead of boolean", async () => {
    const res = await POST(postReq({ approve: "yes" }), { params });
    expect(res.status).toBe(400);
  });

  it("403 when the principal's role cannot decide the requested role level", async () => {
    canDecideMock.mockResolvedValueOnce(false);
    const res = await POST(postReq({ approve: true }), { params });
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error.code).toBe("forbidden");
  });

  it("200 with approved status and session re-queued on approve:true", async () => {
    decideApprovalMock.mockResolvedValueOnce({
      id: "apr1",
      status: "approved",
    });
    const res = await POST(postReq({ approve: true }), { params });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.approvalId).toBe("apr1");
    expect(json.status).toBe("approved");
    expect(json.sessionId).toBe("s1");
    expect(json.sessionStatus).toBe("queued");
  });

  it("200 with rejected status and session failed on approve:false", async () => {
    decideApprovalMock.mockResolvedValueOnce({
      id: "apr1",
      status: "rejected",
    });
    const res = await POST(postReq({ approve: false, reason: "too risky" }), {
      params,
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe("rejected");
    expect(json.sessionStatus).toBe("failed");
  });

  it("passes the optional reason to decideApproval", async () => {
    await POST(postReq({ approve: true, reason: "LGTM" }), { params });
    expect(decideApprovalMock).toHaveBeenCalledWith(
      "apr1",
      expect.objectContaining({ reason: "LGTM" }),
    );
  });

  it("admin principal is flagged as admin in the canDecide call", async () => {
    authenticateApiKeyMock.mockResolvedValueOnce({
      ...PRINCIPAL,
      role: "admin",
    });
    await POST(postReq({ approve: true }), { params });
    expect(canDecideMock).toHaveBeenCalledWith(
      "u1",
      true, // isAdmin = true
      expect.anything(),
    );
  });

  it("non-admin principal passes isAdmin=false to canDecide", async () => {
    await POST(postReq({ approve: true }), { params });
    expect(canDecideMock).toHaveBeenCalledWith(
      "u1",
      false, // isAdmin = false (role=editor)
      expect.anything(),
    );
  });
});
