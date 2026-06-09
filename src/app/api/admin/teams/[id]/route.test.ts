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
      makeRequest({ modelAllowList: ["gpt-5.1", "gemini-2.5-flash"] }),
      makeParams("team-2") as any,
    );
    expect(res.status).toBe(200);
    expect(mockUpdateTeamPolicy).toHaveBeenCalledWith("team-2", { modelAllowList: ["gpt-5.1", "gemini-2.5-flash"] });
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
    const ALL = ["gpt-5.1", "claude-opus-4.8", "gemini-2.5-flash", "gemini-2.5-flash-lite"];
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
