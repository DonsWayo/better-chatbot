import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockDelete, mockSession } = vi.hoisted(() => ({
  mockDelete: vi.fn(),
  mockSession: vi.fn(),
}));

vi.mock("lib/auth/server", () => ({ getSession: mockSession }));
vi.mock("lib/db/pg/db.pg", () => ({ pgDb: { delete: mockDelete } }));
vi.mock("lib/db/pg/schema.pg", () => ({
  AsafeRateLimitBucketTable: { userId: "user_id" },
}));
vi.mock("drizzle-orm", () => ({
  eq: (a: unknown, b: unknown) => ({ eq: [a, b] }),
}));

function makeChain(returning: unknown[]) {
  const chain: Record<string, unknown> = {};
  chain.where = vi.fn(() => chain);
  chain.returning = vi.fn().mockResolvedValue(returning);
  return chain;
}

beforeEach(() => vi.clearAllMocks());

import { DELETE } from "./route";

const adminSession = { user: { id: "admin-1", role: "admin" } };
const regularSession = { user: { id: "user-1", role: "user" } };

function makeParams(id: string) {
  return Promise.resolve({ id });
}

describe("DELETE /api/admin/users/[id]/reset-rate-limit", () => {
  it("returns 401 when unauthenticated", async () => {
    mockSession.mockResolvedValue(null);
    const res = await DELETE({} as never, { params: makeParams("user-1") });
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-admin user", async () => {
    mockSession.mockResolvedValue(regularSession);
    const res = await DELETE({} as never, { params: makeParams("user-1") });
    expect(res.status).toBe(403);
  });

  it("deletes rate-limit buckets and returns deleted count", async () => {
    mockSession.mockResolvedValue(adminSession);
    mockDelete.mockReturnValue(makeChain([{ userId: "user-1" }, { userId: "user-1" }]));

    const res = await DELETE({} as never, { params: makeParams("user-1") });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.deleted).toBe(2);
  });

  it("returns deleted=0 when user had no rate-limit entries", async () => {
    mockSession.mockResolvedValue(adminSession);
    mockDelete.mockReturnValue(makeChain([]));

    const res = await DELETE({} as never, { params: makeParams("user-2") });
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.deleted).toBe(0);
  });

  it("calls delete with correct userId", async () => {
    mockSession.mockResolvedValue(adminSession);
    const chain = makeChain([]);
    mockDelete.mockReturnValue(chain);

    await DELETE({} as never, { params: makeParams("target-user-id") });

    expect(mockDelete).toHaveBeenCalledOnce();
    // chain.where should be called with the eq filter
    expect(chain.where).toHaveBeenCalledOnce();
  });

  it("returns 403 for editor role", async () => {
    mockSession.mockResolvedValue({ user: { id: "e1", role: "editor" } });
    const res = await DELETE({} as never, { params: makeParams("user-1") });
    expect(res.status).toBe(403);
  });

  it("never calls db.delete when unauthenticated", async () => {
    mockSession.mockResolvedValue(null);
    await DELETE({} as never, { params: makeParams("user-1") });
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it("never calls db.delete when not admin", async () => {
    mockSession.mockResolvedValue(regularSession);
    await DELETE({} as never, { params: makeParams("user-1") });
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it("401 body has error field", async () => {
    mockSession.mockResolvedValue(null);
    const res = await DELETE({} as never, { params: makeParams("user-1") });
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("403 body has error field", async () => {
    mockSession.mockResolvedValue(regularSession);
    const res = await DELETE({} as never, { params: makeParams("user-1") });
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("200 body has both success and deleted properties", async () => {
    mockSession.mockResolvedValue(adminSession);
    mockDelete.mockReturnValue(makeChain([{ userId: "u1" }]));
    const res = await DELETE({} as never, { params: makeParams("u1") });
    const body = await res.json();
    expect(body).toHaveProperty("success");
    expect(body).toHaveProperty("deleted");
  });

  it("deleted is a number in the success response", async () => {
    mockSession.mockResolvedValue(adminSession);
    mockDelete.mockReturnValue(makeChain([{ userId: "u1" }, { userId: "u1" }, { userId: "u1" }]));
    const res = await DELETE({} as never, { params: makeParams("u1") });
    const body = await res.json();
    expect(typeof body.deleted).toBe("number");
    expect(body.deleted).toBe(3);
  });
});

describe("DELETE /api/admin/users/[id]/reset-rate-limit — additional", () => {
  beforeEach(() => vi.clearAllMocks());

  it("getSession called exactly once per DELETE", async () => {
    mockSession.mockResolvedValue(null);
    await DELETE({} as never, { params: makeParams("u1") });
    expect(mockSession).toHaveBeenCalledTimes(1);
  });

  it("db.delete called exactly once on valid admin request", async () => {
    mockSession.mockResolvedValue(adminSession);
    mockDelete.mockReturnValue(makeChain([]));
    await DELETE({} as never, { params: makeParams("u1") });
    expect(mockDelete).toHaveBeenCalledTimes(1);
  });

  it("success is true in 200 response body", async () => {
    mockSession.mockResolvedValue(adminSession);
    mockDelete.mockReturnValue(makeChain([]));
    const res = await DELETE({} as never, { params: makeParams("u1") });
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it("403 body has error field for editor role", async () => {
    mockSession.mockResolvedValue({ user: { id: "e1", role: "editor" } });
    const res = await DELETE({} as never, { params: makeParams("u1") });
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });
});
