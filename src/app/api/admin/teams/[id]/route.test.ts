import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

// ── hoisted mocks ──────────────────────────────────────────────────────────────

const { mockGetSession, mockUpdateTeamPolicy } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockUpdateTeamPolicy: vi.fn(),
}));

vi.mock("lib/auth/server", () => ({ getSession: mockGetSession }));
vi.mock("lib/admin/teams", () => ({ updateTeamPolicy: mockUpdateTeamPolicy }));
vi.mock("zod", async (importOriginal) => {
  // Pass through — we need the real Zod so schema validation runs
  return importOriginal();
});

// ── helpers ────────────────────────────────────────────────────────────────────

function makeRequest(body: unknown) {
  return {
    json: async () => body,
  } as unknown as NextRequest;
}

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

// ── tests ──────────────────────────────────────────────────────────────────────

describe("PATCH /api/admin/teams/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateTeamPolicy.mockResolvedValue(undefined);
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetSession.mockResolvedValue(null);
    const { PATCH } = await import("./route");
    const res = await PATCH(makeRequest({}), makeParams("team-1") as any);
    expect(res.status).toBe(401);
  });

  it("returns 403 when role is not admin", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "u1", role: "editor" } });
    const { PATCH } = await import("./route");
    const res = await PATCH(makeRequest({ guardrailPolicy: "strict" }), makeParams("team-1") as any);
    expect(res.status).toBe(403);
  });

  it("returns 400 when guardrailPolicy is invalid", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "u1", role: "admin" } });
    const { PATCH } = await import("./route");
    const res = await PATCH(makeRequest({ guardrailPolicy: "forbidden-value" }), makeParams("team-1") as any);
    expect(res.status).toBe(400);
  });

  it("returns 400 when modelAllowList contains unknown model", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "u1", role: "admin" } });
    const { PATCH } = await import("./route");
    const res = await PATCH(makeRequest({ modelAllowList: ["not-a-real-model"] }), makeParams("team-1") as any);
    expect(res.status).toBe(400);
  });

  it("accepts a valid guardrailPolicy patch", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "u1", role: "admin" } });
    const { PATCH } = await import("./route");
    const res = await PATCH(makeRequest({ guardrailPolicy: "strict" }), makeParams("team-1") as any);
    expect(res.status).toBe(200);
    expect(mockUpdateTeamPolicy).toHaveBeenCalledWith("team-1", { guardrailPolicy: "strict" });
  });

  it("accepts a valid modelAllowList patch with approved models", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "u1", role: "admin" } });
    const { PATCH } = await import("./route");
    const res = await PATCH(
      makeRequest({ modelAllowList: ["gpt-5.5", "gemini-3.5-flash"] }),
      makeParams("team-2") as any,
    );
    expect(res.status).toBe(200);
    expect(mockUpdateTeamPolicy).toHaveBeenCalledWith("team-2", { modelAllowList: ["gpt-5.5", "gemini-3.5-flash"] });
  });

  it("accepts empty modelAllowList to clear restrictions", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "u1", role: "admin" } });
    const { PATCH } = await import("./route");
    const res = await PATCH(makeRequest({ modelAllowList: [] }), makeParams("team-3") as any);
    expect(res.status).toBe(200);
    expect(mockUpdateTeamPolicy).toHaveBeenCalledWith("team-3", { modelAllowList: [] });
  });

  it("accepts all four approved models", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "u1", role: "admin" } });
    const { PATCH } = await import("./route");
    const ALL = ["gpt-5.5", "claude-opus-4.8", "gemini-3.5-flash", "gemini-3.1-flash-lite"];
    const res = await PATCH(makeRequest({ modelAllowList: ALL }), makeParams("team-all") as any);
    expect(res.status).toBe(200);
    expect(mockUpdateTeamPolicy).toHaveBeenCalledWith("team-all", { modelAllowList: ALL });
  });

  it("returns { ok: true } on success", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "u1", role: "admin" } });
    const { PATCH } = await import("./route");
    const res = await PATCH(makeRequest({ allowVision: true }), makeParams("team-ok") as any);
    const body = await res.json();
    expect(body).toEqual({ ok: true });
  });

  it("never calls updateTeamPolicy when unauthenticated", async () => {
    mockGetSession.mockResolvedValue(null);
    const { PATCH } = await import("./route");
    await PATCH(makeRequest({ guardrailPolicy: "strict" }), makeParams("team-1") as any);
    expect(mockUpdateTeamPolicy).not.toHaveBeenCalled();
  });

  it("never calls updateTeamPolicy for non-admin", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "u1", role: "editor" } });
    const { PATCH } = await import("./route");
    await PATCH(makeRequest({ guardrailPolicy: "strict" }), makeParams("team-1") as any);
    expect(mockUpdateTeamPolicy).not.toHaveBeenCalled();
  });

  it("401 body has error field", async () => {
    mockGetSession.mockResolvedValue(null);
    const { PATCH } = await import("./route");
    const res = await PATCH(makeRequest({}), makeParams("team-1") as any);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("403 body has error field", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "u1", role: "editor" } });
    const { PATCH } = await import("./route");
    const res = await PATCH(makeRequest({}), makeParams("team-1") as any);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("updateTeamPolicy called exactly once on success", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "u1", role: "admin" } });
    const { PATCH } = await import("./route");
    await PATCH(makeRequest({ guardrailPolicy: "strict" }), makeParams("team-1") as any);
    expect(mockUpdateTeamPolicy).toHaveBeenCalledTimes(1);
  });

  it("400 body has error field when validation fails", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "u1", role: "admin" } });
    const { PATCH } = await import("./route");
    const res = await PATCH(makeRequest({ guardrailPolicy: "invalid-value" }), makeParams("team-1") as any);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });
});

describe("PATCH /api/admin/teams/[id] — additional", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateTeamPolicy.mockResolvedValue(undefined);
  });

  it("accepts allowImageGen=true patch", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "u1", role: "admin" } });
    const { PATCH } = await import("./route");
    const res = await PATCH(makeRequest({ allowImageGen: true }), makeParams("team-img") as any);
    expect(res.status).toBe(200);
    expect(mockUpdateTeamPolicy).toHaveBeenCalledWith("team-img", { allowImageGen: true });
  });

  it("accepts allowVision=false patch", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "u1", role: "admin" } });
    const { PATCH } = await import("./route");
    const res = await PATCH(makeRequest({ allowVision: false }), makeParams("team-v") as any);
    expect(res.status).toBe(200);
  });

  it("accepts empty allowedEmailDomains array", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "u1", role: "admin" } });
    const { PATCH } = await import("./route");
    const res = await PATCH(makeRequest({ allowedEmailDomains: [] }), makeParams("team-d") as any);
    expect(res.status).toBe(200);
    expect(mockUpdateTeamPolicy).toHaveBeenCalledWith("team-d", { allowedEmailDomains: [] });
  });

  it("rejects invalid domain in allowedEmailDomains", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "u1", role: "admin" } });
    const { PATCH } = await import("./route");
    const res = await PATCH(makeRequest({ allowedEmailDomains: ["not valid domain!"] }), makeParams("team-1") as any);
    expect(res.status).toBe(400);
  });

  it("getSession called exactly once per PATCH", async () => {
    mockGetSession.mockResolvedValue(null);
    const { PATCH } = await import("./route");
    await PATCH(makeRequest({ guardrailPolicy: "strict" }), makeParams("team-1") as any);
    expect(mockGetSession).toHaveBeenCalledTimes(1);
  });
});

describe("PATCH /api/admin/teams/[id] — response shape", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateTeamPolicy.mockResolvedValue(undefined);
  });

  it("response is always a Response instance", async () => {
    mockGetSession.mockResolvedValue(null);
    const { PATCH } = await import("./route");
    const res = await PATCH(makeRequest({}), makeParams("team-1") as any);
    expect(res).toBeInstanceOf(Response);
  });

  it("200 ok field is strictly boolean true", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "u1", role: "admin" } });
    const { PATCH } = await import("./route");
    const res = await PATCH(makeRequest({ guardrailPolicy: "strict" }), makeParams("team-1") as any);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it("updateTeamPolicy receives the correct teamId", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "u1", role: "admin" } });
    const { PATCH } = await import("./route");
    await PATCH(makeRequest({ guardrailPolicy: "strict" }), makeParams("team-99") as any);
    expect(mockUpdateTeamPolicy).toHaveBeenCalledWith("team-99", expect.anything());
  });

  it("never calls updateTeamPolicy when validation fails", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "u1", role: "admin" } });
    const { PATCH } = await import("./route");
    await PATCH(makeRequest({ guardrailPolicy: "invalid-value" }), makeParams("team-1") as any);
    expect(mockUpdateTeamPolicy).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/admin/teams/[id] — edge cases", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateTeamPolicy.mockResolvedValue(undefined);
  });

  it("rejects when guardrailPolicy is an invalid enum value", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "u1", role: "admin" } });
    const { PATCH } = await import("./route");
    const res = await PATCH(makeRequest({ guardrailPolicy: "off" }), makeParams("team-1") as any);
    expect(res.status).toBe(400);
  });

  it("accepts both allowImageGen and allowVision in same patch", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "u1", role: "admin" } });
    const { PATCH } = await import("./route");
    const res = await PATCH(makeRequest({ allowImageGen: true, allowVision: true }), makeParams("team-patch") as any);
    expect(res.status).toBe(200);
    expect(mockUpdateTeamPolicy).toHaveBeenCalledWith("team-patch", { allowImageGen: true, allowVision: true });
  });

  it("team-id from params is forwarded verbatim to updateTeamPolicy", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "u1", role: "admin" } });
    const { PATCH } = await import("./route");
    await PATCH(makeRequest({ guardrailPolicy: "strict" }), makeParams("exact-team-id") as any);
    expect(mockUpdateTeamPolicy).toHaveBeenCalledWith("exact-team-id", expect.anything());
  });

  it("never calls updateTeamPolicy when body parsing fails validation", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "u1", role: "admin" } });
    const { PATCH } = await import("./route");
    await PATCH(makeRequest({ modelAllowList: ["not-a-real-model"] }), makeParams("team-1") as any);
    expect(mockUpdateTeamPolicy).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/admin/teams/[id] — call count invariants", () => {
  beforeEach(() => { vi.clearAllMocks(); vi.resetModules(); mockUpdateTeamPolicy.mockResolvedValue(undefined); });

  it("getSession called exactly once per PATCH", async () => {
    mockGetSession.mockResolvedValue(null);
    const { PATCH } = await import("./route");
    await PATCH(makeRequest({ allowVision: true }), makeParams("t1") as any);
    expect(mockGetSession).toHaveBeenCalledTimes(1);
  });

  it("updateTeamPolicy never called when unauthenticated", async () => {
    mockGetSession.mockResolvedValue(null);
    const { PATCH } = await import("./route");
    await PATCH(makeRequest({ allowVision: true }), makeParams("t1") as any);
    expect(mockUpdateTeamPolicy).not.toHaveBeenCalled();
  });

  it("returns 401 Response instance when unauthenticated", async () => {
    mockGetSession.mockResolvedValue(null);
    const { PATCH } = await import("./route");
    const res = await PATCH(makeRequest({ allowVision: true }), makeParams("t1") as any);
    expect(res).toBeInstanceOf(Response);
    expect(res.status).toBe(401);
  });

  it("updateTeamPolicy called exactly once on valid admin PATCH", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "u1", role: "admin" } });
    const { PATCH } = await import("./route");
    await PATCH(makeRequest({ allowVision: true }), makeParams("t1") as any);
    expect(mockUpdateTeamPolicy).toHaveBeenCalledTimes(1);
  });
});
