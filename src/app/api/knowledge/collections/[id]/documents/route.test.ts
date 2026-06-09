import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

const { getSessionMock, dbSelectMock } = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  dbSelectMock: vi.fn(),
}));

vi.mock("lib/auth/server", () => ({ getSession: getSessionMock }));

// First select returns collection check; second returns grouped documents
const dbSelectWhereMock = vi.fn().mockResolvedValue([]);
const dbSelectGroupByMock = vi.fn().mockReturnValue({ orderBy: vi.fn().mockResolvedValue([]) });
const dbSelectFromMock = vi.fn().mockReturnValue({
  where: dbSelectWhereMock,
  groupBy: dbSelectGroupByMock,
});
dbSelectMock.mockReturnValue({ from: dbSelectFromMock, select: vi.fn() });

vi.mock("lib/db/pg/db.pg", () => ({
  pgDb: { select: dbSelectMock },
}));
vi.mock("lib/db/pg/schema.pg", () => ({
  AsafeKnowledgeCollectionTable: { id: "id" },
  AsafeDocumentChunkTable: { collectionId: "collectionId", sourceRef: "sourceRef", createdAt: "createdAt" },
}));
vi.mock("drizzle-orm", () => ({
  eq: vi.fn((_a: unknown, _b: unknown) => ({})),
  sql: vi.fn((s: TemplateStringsArray, ..._: unknown[]) => s.join("")),
}));

function makeRequest(): NextRequest {
  return {} as unknown as NextRequest;
}

describe("GET /api/knowledge/collections/[id]/documents", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns 401 when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), { params: Promise.resolve({ id: "col-1" }) });
    expect(res.status).toBe(401);
  });

  it("returns 404 when collection not found", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1", role: "user" } });
    // First select (collection check) returns empty
    dbSelectWhereMock.mockResolvedValueOnce([]);
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), { params: Promise.resolve({ id: "missing" }) });
    expect(res.status).toBe(404);
  });

  it("returns 200 with documents list", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1", role: "user" } });
    let callCount = 0;
    dbSelectMock.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return {
          from: () => ({
            where: () => Promise.resolve([{ id: "col-1" }]),
          }),
        };
      }
      return {
        from: () => ({
          where: () => ({
            groupBy: () => ({
              orderBy: () => Promise.resolve([
                { sourceRef: "guide.md", chunkCount: 3, createdAt: "2026-01-01T00:00:00Z" },
              ]),
            }),
          }),
        }),
      };
    });
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), { params: Promise.resolve({ id: "col-1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.documents).toBeDefined();
  });

  it("never calls db.select when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    await GET(makeRequest(), { params: Promise.resolve({ id: "col-1" }) });
    expect(dbSelectMock).not.toHaveBeenCalled();
  });

  it("returns 200 with empty documents array when collection has no documents", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1", role: "user" } });
    let callCount = 0;
    dbSelectMock.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return {
          from: () => ({
            where: () => Promise.resolve([{ id: "col-1" }]),
          }),
        };
      }
      return {
        from: () => ({
          where: () => ({
            groupBy: () => ({
              orderBy: () => Promise.resolve([]),
            }),
          }),
        }),
      };
    });
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), { params: Promise.resolve({ id: "col-1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.documents).toHaveLength(0);
  });

  it("401 response body has error field", async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), { params: Promise.resolve({ id: "col-1" }) });
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("404 response body has error field", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1", role: "user" } });
    // Re-establish chain mock (may be overridden by earlier mockImplementation calls)
    dbSelectMock.mockReturnValueOnce({
      from: () => ({ where: () => Promise.resolve([]) }),
    });
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), { params: Promise.resolve({ id: "missing" }) });
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("200 response documents property is an array", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1", role: "user" } });
    let callCount = 0;
    dbSelectMock.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return { from: () => ({ where: () => Promise.resolve([{ id: "col-1" }]) }) };
      }
      return { from: () => ({ where: () => ({ groupBy: () => ({ orderBy: () => Promise.resolve([]) }) }) }) };
    });
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), { params: Promise.resolve({ id: "col-1" }) });
    const body = await res.json();
    expect(Array.isArray(body.documents)).toBe(true);
  });

  it("getSession called exactly once per request", async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    await GET(makeRequest(), { params: Promise.resolve({ id: "col-1" }) });
    expect(getSessionMock).toHaveBeenCalledTimes(1);
  });
});
