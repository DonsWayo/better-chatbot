import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const dbQueryMock = vi.fn();
  const pgDb = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    orderBy: dbQueryMock,
  };
  return { getSessionMock: vi.fn(), dbQueryMock, pgDb };
});

vi.mock("auth/server", () => ({ getSession: h.getSessionMock }));
vi.mock("lib/db/pg/db.pg", () => ({ pgDb: h.pgDb }));
vi.mock("lib/db/pg/schema.pg", () => ({
  UserTable: { id: "id", name: "name", image: "image", email: "email" },
}));
vi.mock("drizzle-orm", () => ({
  ilike: vi.fn(() => "ilike"),
  or: vi.fn((...a: unknown[]) => `or(${a.join(",")})`),
  sql: vi.fn(() => "sql"),
}));

import { NextRequest } from "next/server";

function makeRequest(q = ""): NextRequest {
  return new NextRequest(`http://localhost/api/users/search?q=${encodeURIComponent(q)}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  h.pgDb.select.mockReturnThis();
  h.pgDb.from.mockReturnThis();
  h.pgDb.where.mockReturnThis();
  h.pgDb.limit.mockReturnThis();
  h.getSessionMock.mockResolvedValue({ user: { id: "u1" } });
});

describe("GET /api/users/search", () => {
  it("returns 401 when unauthenticated", async () => {
    h.getSessionMock.mockResolvedValue(null);
    h.dbQueryMock.mockResolvedValue([]);
    const { GET } = await import("./route");
    const res = await GET(makeRequest("alice"));
    expect(res.status).toBe(401);
  });

  it("returns matching users as JSON", async () => {
    const users = [{ id: "u2", name: "Alice", image: null }];
    h.dbQueryMock.mockResolvedValue(users);
    const { GET } = await import("./route");
    const res = await GET(makeRequest("alice"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.users).toEqual(users);
  });

  it("returns empty array when no matches", async () => {
    h.dbQueryMock.mockResolvedValue([]);
    const { GET } = await import("./route");
    const res = await GET(makeRequest("zzz"));
    const body = await res.json();
    expect(body.users).toEqual([]);
  });

  it("returns up to 20 results", async () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ id: `u${i}`, name: `User${i}`, image: null }));
    h.dbQueryMock.mockResolvedValue(many);
    const { GET } = await import("./route");
    const res = await GET(makeRequest("u"));
    const body = await res.json();
    expect(body.users).toHaveLength(20);
  });
});
