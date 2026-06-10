import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

const {
  getSessionMock,
  selectByIdMock,
  removeMcpClientActionMock,
  canManageMCPServerMock,
} = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  selectByIdMock: vi.fn(),
  removeMcpClientActionMock: vi.fn(),
  canManageMCPServerMock: vi.fn(),
}));

vi.mock("auth/server", () => ({ getSession: getSessionMock }));
vi.mock("lib/db/pg/repositories/mcp-repository.pg", () => ({
  pgMcpRepository: { selectById: selectByIdMock },
}));
vi.mock("@/app/api/mcp/actions", () => ({ removeMcpClientAction: removeMcpClientActionMock }));
vi.mock("lib/auth/permissions", () => ({ canManageMCPServer: canManageMCPServerMock }));
vi.mock("lib/logger", () => ({
  default: { error: vi.fn() },
}));

const MCP_SERVER = { id: "11111111-1111-4111-8111-111111111111", name: "Test MCP", userId: "u1", config: { url: "http://mcp" } };

function makeRequest(): NextRequest {
  return {} as unknown as NextRequest;
}

describe("GET /api/mcp/[id]", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns 401 when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), { params: Promise.resolve({ id: "11111111-1111-4111-8111-111111111111" }) });
    expect(res.status).toBe(401);
  });

  it("returns 404 when server not found", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1", role: "user" } });
    selectByIdMock.mockResolvedValueOnce(null);
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), { params: Promise.resolve({ id: "22222222-2222-4222-8222-222222222222" }) });
    expect(res.status).toBe(404);
  });

  it("returns 403 for non-owner non-admin", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u2", role: "user" } });
    selectByIdMock.mockResolvedValueOnce(MCP_SERVER);
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), { params: Promise.resolve({ id: "11111111-1111-4111-8111-111111111111" }) });
    expect(res.status).toBe(403);
  });

  it("returns mcp server for owner", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1", role: "user" } });
    selectByIdMock.mockResolvedValueOnce(MCP_SERVER);
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), { params: Promise.resolve({ id: "11111111-1111-4111-8111-111111111111" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe("11111111-1111-4111-8111-111111111111");
  });

  it("returns mcp server for admin", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "a1", role: "admin" } });
    selectByIdMock.mockResolvedValueOnce(MCP_SERVER);
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), { params: Promise.resolve({ id: "11111111-1111-4111-8111-111111111111" }) });
    expect(res.status).toBe(200);
  });

  it("never calls selectById when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    await GET(makeRequest(), { params: Promise.resolve({ id: "11111111-1111-4111-8111-111111111111" }) });
    expect(selectByIdMock).not.toHaveBeenCalled();
  });

  it("401 body has error field", async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), { params: Promise.resolve({ id: "11111111-1111-4111-8111-111111111111" }) });
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("403 body has error field", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u2", role: "user" } });
    selectByIdMock.mockResolvedValueOnce(MCP_SERVER);
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), { params: Promise.resolve({ id: "11111111-1111-4111-8111-111111111111" }) });
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });
});

describe("DELETE /api/mcp/[id]", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns 401 when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { DELETE } = await import("./route");
    const res = await DELETE(makeRequest(), { params: Promise.resolve({ id: "11111111-1111-4111-8111-111111111111" }) });
    expect(res.status).toBe(401);
  });

  it("returns 404 when server not found", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1", role: "user" } });
    selectByIdMock.mockResolvedValueOnce(null);
    const { DELETE } = await import("./route");
    const res = await DELETE(makeRequest(), { params: Promise.resolve({ id: "22222222-2222-4222-8222-222222222222" }) });
    expect(res.status).toBe(404);
  });

  it("returns 403 when cannot manage server", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u2", role: "user" } });
    selectByIdMock.mockResolvedValueOnce({ ...MCP_SERVER, visibility: "private" });
    canManageMCPServerMock.mockResolvedValueOnce(false);
    const { DELETE } = await import("./route");
    const res = await DELETE(makeRequest(), { params: Promise.resolve({ id: "11111111-1111-4111-8111-111111111111" }) });
    expect(res.status).toBe(403);
  });

  it("deletes server and returns success", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1", role: "user" } });
    selectByIdMock.mockResolvedValueOnce({ ...MCP_SERVER, visibility: "private" });
    canManageMCPServerMock.mockResolvedValueOnce(true);
    removeMcpClientActionMock.mockResolvedValueOnce(undefined);
    const { DELETE } = await import("./route");
    const res = await DELETE(makeRequest(), { params: Promise.resolve({ id: "11111111-1111-4111-8111-111111111111" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it("never calls removeMcpClientAction when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { DELETE } = await import("./route");
    await DELETE(makeRequest(), { params: Promise.resolve({ id: "11111111-1111-4111-8111-111111111111" }) });
    expect(removeMcpClientActionMock).not.toHaveBeenCalled();
  });

  it("never calls removeMcpClientAction when server not found", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1", role: "user" } });
    selectByIdMock.mockResolvedValueOnce(null);
    const { DELETE } = await import("./route");
    await DELETE(makeRequest(), { params: Promise.resolve({ id: "22222222-2222-4222-8222-222222222222" }) });
    expect(removeMcpClientActionMock).not.toHaveBeenCalled();
  });

  it("never calls removeMcpClientAction when forbidden", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u2", role: "user" } });
    selectByIdMock.mockResolvedValueOnce({ ...MCP_SERVER, visibility: "private" });
    canManageMCPServerMock.mockResolvedValueOnce(false);
    const { DELETE } = await import("./route");
    await DELETE(makeRequest(), { params: Promise.resolve({ id: "11111111-1111-4111-8111-111111111111" }) });
    expect(removeMcpClientActionMock).not.toHaveBeenCalled();
  });

  it("401 body has error field", async () => {
    getSessionMock.mockResolvedValue(null);
    const { DELETE } = await import("./route");
    const res = await DELETE(makeRequest(), { params: Promise.resolve({ id: "11111111-1111-4111-8111-111111111111" }) });
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("403 body has error field", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u2", role: "user" } });
    selectByIdMock.mockResolvedValueOnce({ ...MCP_SERVER, visibility: "private" });
    canManageMCPServerMock.mockResolvedValueOnce(false);
    const { DELETE } = await import("./route");
    const res = await DELETE(makeRequest(), { params: Promise.resolve({ id: "11111111-1111-4111-8111-111111111111" }) });
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("removeMcpClientAction called exactly once on success", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1", role: "user" } });
    selectByIdMock.mockResolvedValueOnce({ ...MCP_SERVER, visibility: "private" });
    canManageMCPServerMock.mockResolvedValueOnce(true);
    removeMcpClientActionMock.mockResolvedValueOnce(undefined);
    const { DELETE } = await import("./route");
    await DELETE(makeRequest(), { params: Promise.resolve({ id: "11111111-1111-4111-8111-111111111111" }) });
    expect(removeMcpClientActionMock).toHaveBeenCalledTimes(1);
  });
});

describe("GET /api/mcp/[id] — response shape", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("response is always a Response instance for 401", async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), { params: Promise.resolve({ id: "11111111-1111-4111-8111-111111111111" }) });
    expect(res).toBeInstanceOf(Response);
  });

  it("200 body has id field matching the MCP server", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1", role: "user" } });
    selectByIdMock.mockResolvedValueOnce(MCP_SERVER);
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), { params: Promise.resolve({ id: "11111111-1111-4111-8111-111111111111" }) });
    const body = await res.json();
    expect(body.id).toBe("11111111-1111-4111-8111-111111111111");
  });

  it("selectById called exactly once per GET", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1", role: "user" } });
    selectByIdMock.mockResolvedValueOnce(MCP_SERVER);
    const { GET } = await import("./route");
    await GET(makeRequest(), { params: Promise.resolve({ id: "11111111-1111-4111-8111-111111111111" }) });
    expect(selectByIdMock).toHaveBeenCalledTimes(1);
  });

  it("DELETE response is always a Response instance", async () => {
    getSessionMock.mockResolvedValue(null);
    const { DELETE } = await import("./route");
    const res = await DELETE(makeRequest(), { params: Promise.resolve({ id: "11111111-1111-4111-8111-111111111111" }) });
    expect(res).toBeInstanceOf(Response);
  });
});

describe("GET and DELETE /api/mcp/[id] — call count invariants", () => {
  beforeEach(() => { vi.clearAllMocks(); vi.resetModules(); });

  it("getSession called exactly once per GET", async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    await GET(makeRequest(), { params: Promise.resolve({ id: "11111111-1111-4111-8111-111111111111" }) });
    expect(getSessionMock).toHaveBeenCalledTimes(1);
  });

  it("selectById never called when GET unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    await GET(makeRequest(), { params: Promise.resolve({ id: "11111111-1111-4111-8111-111111111111" }) });
    expect(selectByIdMock).not.toHaveBeenCalled();
  });

  it("removeMcpClientAction never called when DELETE unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { DELETE } = await import("./route");
    await DELETE(makeRequest(), { params: Promise.resolve({ id: "11111111-1111-4111-8111-111111111111" }) });
    expect(removeMcpClientActionMock).not.toHaveBeenCalled();
  });

  it("GET returns 401 body with error property when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), { params: Promise.resolve({ id: "11111111-1111-4111-8111-111111111111" }) });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });
});
