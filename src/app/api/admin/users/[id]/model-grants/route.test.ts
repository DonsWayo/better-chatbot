import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

const { mockGetSession, mockListGrants, mockGrantModel } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockListGrants: vi.fn(),
  mockGrantModel: vi.fn(),
}));

vi.mock("lib/auth/server", () => ({ getSession: mockGetSession }));
vi.mock("lib/admin/user-grants", () => ({
  listUserModelGrants: mockListGrants,
  grantUserModel: mockGrantModel,
}));

const fakeGrant = { id: "g1", modelId: "gpt-5.1", grantedBy: "admin", expiresAt: null, createdAt: new Date() };

function makeGetRequest() {
  return {} as unknown as NextRequest;
}
function makePostRequest(body: unknown) {
  return { json: async () => body } as unknown as NextRequest;
}
function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("GET /api/admin/users/[id]/model-grants", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListGrants.mockResolvedValue([]);
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetSession.mockResolvedValue(null);
    const { GET } = await import("./route");
    const res = await GET(makeGetRequest(), makeParams("u1") as any);
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-admin", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "u1", role: "editor" } });
    const { GET } = await import("./route");
    const res = await GET(makeGetRequest(), makeParams("u1") as any);
    expect(res.status).toBe(403);
  });

  it("returns grants list for admin", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "a1", role: "admin" } });
    mockListGrants.mockResolvedValue([fakeGrant]);
    const { GET } = await import("./route");
    const res = await GET(makeGetRequest(), makeParams("u1") as any);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.grants).toHaveLength(1);
  });
});

describe("POST /api/admin/users/[id]/model-grants", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGrantModel.mockResolvedValue(undefined);
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetSession.mockResolvedValue(null);
    const { POST } = await import("./route");
    const res = await POST(makePostRequest({}), makeParams("u1") as any);
    expect(res.status).toBe(401);
  });

  it("returns 400 for unknown model", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "a1", role: "admin" } });
    const { POST } = await import("./route");
    const res = await POST(makePostRequest({ modelId: "not-real" }), makeParams("u1") as any);
    expect(res.status).toBe(400);
  });

  it("grants approved model and returns ok", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "a1", role: "admin" } });
    const { POST } = await import("./route");
    const res = await POST(makePostRequest({ modelId: "gpt-5.1" }), makeParams("u2") as any);
    expect(res.status).toBe(200);
    expect(mockGrantModel).toHaveBeenCalledWith("u2", "gpt-5.1", "a1", null);
  });

  it("passes expiresAt when provided", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "a1", role: "admin" } });
    const { POST } = await import("./route");
    const exp = "2027-01-01T00:00:00.000Z";
    await POST(makePostRequest({ modelId: "claude-opus-4.8", expiresAt: exp }), makeParams("u3") as any);
    expect(mockGrantModel).toHaveBeenCalledWith("u3", "claude-opus-4.8", "a1", new Date(exp));
  });
});

describe("GET /api/admin/users/[id]/model-grants — guard chains", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListGrants.mockResolvedValue([]);
  });

  it("never calls listGrants when unauthenticated", async () => {
    mockGetSession.mockResolvedValue(null);
    const { GET } = await import("./route");
    await GET(makeGetRequest(), makeParams("u1") as any);
    expect(mockListGrants).not.toHaveBeenCalled();
  });

  it("never calls listGrants for non-admin", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "u1", role: "user" } });
    const { GET } = await import("./route");
    await GET(makeGetRequest(), makeParams("u1") as any);
    expect(mockListGrants).not.toHaveBeenCalled();
  });

  it("response body has grants array", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "a1", role: "admin" } });
    mockListGrants.mockResolvedValue([fakeGrant]);
    const { GET } = await import("./route");
    const res = await GET(makeGetRequest(), makeParams("u1") as any);
    const body = await res.json();
    expect(Array.isArray(body.grants)).toBe(true);
  });
});

describe("POST /api/admin/users/[id]/model-grants — guard chains", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGrantModel.mockResolvedValue(undefined);
  });

  it("never calls grantModel when unauthenticated", async () => {
    mockGetSession.mockResolvedValue(null);
    const { POST } = await import("./route");
    await POST(makePostRequest({ modelId: "gpt-5.1" }), makeParams("u1") as any);
    expect(mockGrantModel).not.toHaveBeenCalled();
  });

  it("never calls grantModel for unknown model", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "a1", role: "admin" } });
    const { POST } = await import("./route");
    await POST(makePostRequest({ modelId: "not-real" }), makeParams("u1") as any);
    expect(mockGrantModel).not.toHaveBeenCalled();
  });
});
