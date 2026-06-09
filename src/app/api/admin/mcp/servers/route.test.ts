import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

const { getSessionMock, dbSelectMock, dbInsertMock } = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  dbSelectMock: vi.fn(),
  dbInsertMock: vi.fn(),
}));

vi.mock("lib/auth/server", () => ({ getSession: getSessionMock }));

const dbSelectWhereMock = vi.fn().mockResolvedValue([]);
const dbSelectFromMock = vi.fn().mockReturnValue({ where: dbSelectWhereMock });
dbSelectMock.mockReturnValue({ from: dbSelectFromMock });

const dbInsertReturningMock = vi.fn().mockResolvedValue([{ id: "srv-1", name: "Test MCP" }]);
const dbInsertValuesMock = vi.fn().mockReturnValue({ returning: dbInsertReturningMock });
dbInsertMock.mockReturnValue({ values: dbInsertValuesMock });

vi.mock("lib/db/pg/db.pg", () => ({
  pgDb: { select: dbSelectMock, insert: dbInsertMock },
}));
vi.mock("lib/db/pg/schema.pg", () => ({
  McpServerTable: { id: "id", scope: "scope", name: "name", enabled: "enabled" },
}));
vi.mock("drizzle-orm", () => ({
  inArray: vi.fn((_col: unknown, _vals: unknown) => ({})),
  eq: vi.fn((_a: unknown, _b: unknown) => ({})),
}));

function makeRequest(body?: unknown): NextRequest {
  return {
    headers: new Headers({ "content-type": "application/json" }),
    json: () => Promise.resolve(body),
  } as unknown as NextRequest;
}

describe("GET /api/admin/mcp/servers", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns 401 when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-admin", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1", role: "user" } });
    const { GET } = await import("./route");
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("returns 200 with servers list for admin", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "a1", role: "admin" } });
    dbSelectWhereMock.mockResolvedValue([{ id: "srv-1", name: "Company Jira" }]);

    const { GET } = await import("./route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.servers).toHaveLength(1);
  });

  it("never queries DB when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    await GET();
    expect(dbSelectMock).not.toHaveBeenCalled();
  });

  it("never queries DB for non-admin", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1", role: "user" } });
    const { GET } = await import("./route");
    await GET();
    expect(dbSelectMock).not.toHaveBeenCalled();
  });

  it("401 body has error field", async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    const res = await GET();
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("403 body has error field", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1", role: "user" } });
    const { GET } = await import("./route");
    const res = await GET();
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });
});

describe("POST /api/admin/mcp/servers", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns 401 when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-admin", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1", role: "user" } });
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ name: "Tool", scope: "org", config: { url: "https://mcp.example.com" } }));
    expect(res.status).toBe(403);
  });

  it("returns 400 on invalid body", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "a1", role: "admin" } });
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ scope: "invalid" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when scope=team but teamId is missing", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "a1", role: "admin" } });
    const { POST } = await import("./route");
    const res = await POST(makeRequest({
      name: "My Tool",
      scope: "team",
      config: { url: "https://mcp.example.com" },
    }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/teamId/i);
  });

  it("creates server and returns 201 for valid org-wide request", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "a1", role: "admin" } });
    dbInsertReturningMock.mockResolvedValue([{ id: "srv-new", name: "Docs MCP", scope: "org" }]);

    const { POST } = await import("./route");
    const res = await POST(makeRequest({
      name: "Docs MCP",
      scope: "org",
      config: { url: "https://docs-mcp.example.com/sse" },
    }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.server.name).toBe("Docs MCP");
  });

  it("never calls dbInsert when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    await POST(makeRequest({ name: "Tool", scope: "org", config: { url: "https://mcp.example.com" } }));
    expect(dbInsertMock).not.toHaveBeenCalled();
  });

  it("never calls dbInsert for non-admin", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1", role: "user" } });
    const { POST } = await import("./route");
    await POST(makeRequest({ name: "Tool", scope: "org", config: { url: "https://mcp.example.com" } }));
    expect(dbInsertMock).not.toHaveBeenCalled();
  });

  it("401 body has error field", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    const res = await POST(makeRequest({}));
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("403 body has error field", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1", role: "user" } });
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ name: "Tool", scope: "org", config: { url: "https://mcp.example.com" } }));
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("dbInsert called exactly once on successful POST", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "a1", role: "admin" } });
    dbInsertReturningMock.mockResolvedValue([{ id: "srv-ok", name: "Docs MCP", scope: "org" }]);
    const { POST } = await import("./route");
    await POST(makeRequest({ name: "Docs MCP", scope: "org", config: { url: "https://mcp.example.com/sse" } }));
    expect(dbInsertMock).toHaveBeenCalledTimes(1);
  });

  it("getSession called exactly once per POST", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    await POST(makeRequest({}));
    expect(getSessionMock).toHaveBeenCalledTimes(1);
  });
});

describe("GET /api/admin/mcp/servers — additional", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("getSession called exactly once per GET", async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    await GET();
    expect(getSessionMock).toHaveBeenCalledTimes(1);
  });

  it("200 body has servers property", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "a1", role: "admin" } });
    dbSelectWhereMock.mockResolvedValue([]);
    const { GET } = await import("./route");
    const res = await GET();
    const body = await res.json();
    expect(body).toHaveProperty("servers");
  });

  it("returns 403 for editor role", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "e1", role: "editor" } });
    const { GET } = await import("./route");
    const res = await GET();
    expect(res.status).toBe(403);
  });
});
