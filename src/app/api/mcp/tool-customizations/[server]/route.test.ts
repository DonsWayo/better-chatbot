import { describe, it, expect, vi, beforeEach } from "vitest";

const { getSessionMock, selectByUserIdAndMcpServerIdMock } = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  selectByUserIdAndMcpServerIdMock: vi.fn(),
}));

vi.mock("auth/server", () => ({ getSession: getSessionMock }));
vi.mock("lib/db/repository", () => ({
  mcpMcpToolCustomizationRepository: {
    selectByUserIdAndMcpServerId: selectByUserIdAndMcpServerIdMock,
  },
}));

describe("GET /api/mcp/tool-customizations/[server]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    const res = await GET({} as Request, { params: Promise.resolve({ server: "srv-1" }) });
    expect(res.status).toBe(401);
  });

  it("returns 401 body text when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    const res = await GET({} as Request, { params: Promise.resolve({ server: "srv-1" }) });
    const body = await res.text();
    expect(body).toMatch(/[Uu]nauthorized/);
  });

  it("never queries repository when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    await GET({} as Request, { params: Promise.resolve({ server: "srv-1" }) });
    expect(selectByUserIdAndMcpServerIdMock).not.toHaveBeenCalled();
  });

  it("returns 200 with tool customizations for authenticated user", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    const CUSTOMIZATIONS = [{ toolName: "search", prompt: "Search carefully" }];
    selectByUserIdAndMcpServerIdMock.mockResolvedValueOnce(CUSTOMIZATIONS);
    const { GET } = await import("./route");
    const res = await GET({} as Request, { params: Promise.resolve({ server: "srv-1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
  });

  it("returns empty array when no customizations exist", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    selectByUserIdAndMcpServerIdMock.mockResolvedValueOnce([]);
    const { GET } = await import("./route");
    const res = await GET({} as Request, { params: Promise.resolve({ server: "srv-1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual([]);
  });

  it("passes correct server ID to repository", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    selectByUserIdAndMcpServerIdMock.mockResolvedValueOnce([]);
    const { GET } = await import("./route");
    await GET({} as Request, { params: Promise.resolve({ server: "my-server-123" }) });
    expect(selectByUserIdAndMcpServerIdMock).toHaveBeenCalledWith(
      expect.objectContaining({ mcpServerId: "my-server-123" }),
    );
  });

  it("passes correct user ID to repository", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-abc-xyz" } });
    selectByUserIdAndMcpServerIdMock.mockResolvedValueOnce([]);
    const { GET } = await import("./route");
    await GET({} as Request, { params: Promise.resolve({ server: "srv" }) });
    expect(selectByUserIdAndMcpServerIdMock).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-abc-xyz" }),
    );
  });

  it("returns multiple customizations for a server", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    const CUSTOMIZATIONS = [
      { toolName: "search", prompt: "Be thorough" },
      { toolName: "browse", prompt: "Extract key info" },
      { toolName: "code", prompt: "Write clean code" },
    ];
    selectByUserIdAndMcpServerIdMock.mockResolvedValueOnce(CUSTOMIZATIONS);
    const { GET } = await import("./route");
    const res = await GET({} as Request, { params: Promise.resolve({ server: "srv-1" }) });
    const body = await res.json();
    expect(body).toHaveLength(3);
    expect(body[0].toolName).toBe("search");
    expect(body[2].toolName).toBe("code");
  });

  it("preserves customization fields in response", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    const customization = { toolName: "fetch", prompt: "Fetch data carefully", id: "c-1" };
    selectByUserIdAndMcpServerIdMock.mockResolvedValueOnce([customization]);
    const { GET } = await import("./route");
    const res = await GET({} as Request, { params: Promise.resolve({ server: "srv-1" }) });
    const body = await res.json();
    expect(body[0].toolName).toBe("fetch");
    expect(body[0].prompt).toBe("Fetch data carefully");
    expect(body[0].id).toBe("c-1");
  });

  it("response body is always an array", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    selectByUserIdAndMcpServerIdMock.mockResolvedValueOnce([]);
    const { GET } = await import("./route");
    const res = await GET({} as Request, { params: Promise.resolve({ server: "srv-1" }) });
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  it("selectByUserIdAndMcpServerId called exactly once per authenticated request", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    selectByUserIdAndMcpServerIdMock.mockResolvedValueOnce([]);
    const { GET } = await import("./route");
    await GET({} as Request, { params: Promise.resolve({ server: "srv-1" }) });
    expect(selectByUserIdAndMcpServerIdMock).toHaveBeenCalledTimes(1);
  });
});

describe("GET /api/mcp/tool-customizations/[server] — additional", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("getSession called exactly once per GET", async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    await GET({} as Request, { params: Promise.resolve({ server: "srv-1" }) });
    expect(getSessionMock).toHaveBeenCalledTimes(1);
  });

  it("repository never called for different server when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    await GET({} as Request, { params: Promise.resolve({ server: "other-server" }) });
    expect(selectByUserIdAndMcpServerIdMock).not.toHaveBeenCalled();
  });

  it("200 status for authenticated user even with empty customizations", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u-empty" } });
    selectByUserIdAndMcpServerIdMock.mockResolvedValueOnce([]);
    const { GET } = await import("./route");
    const res = await GET({} as Request, { params: Promise.resolve({ server: "srv-empty" }) });
    expect(res.status).toBe(200);
  });
});

describe("GET /api/mcp/tool-customizations/[server] — call count invariants", () => {
  beforeEach(() => { vi.clearAllMocks(); vi.resetModules(); });

  it("getSession called exactly once per GET", async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    await GET({} as Request, { params: Promise.resolve({ server: "s-1" }) });
    expect(getSessionMock).toHaveBeenCalledTimes(1);
  });

  it("selectByUserIdAndMcpServerId not called when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    await GET({} as Request, { params: Promise.resolve({ server: "s-1" }) });
    expect(selectByUserIdAndMcpServerIdMock).not.toHaveBeenCalled();
  });

  it("GET returns 401 Response when session is null", async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    const res = await GET({} as Request, { params: Promise.resolve({ server: "s-1" }) });
    expect(res).toBeInstanceOf(Response);
    expect(res.status).toBe(401);
  });

  it("response is always a Response instance", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    selectByUserIdAndMcpServerIdMock.mockResolvedValueOnce([]);
    const { GET } = await import("./route");
    const res = await GET({} as Request, { params: Promise.resolve({ server: "s-1" }) });
    expect(res).toBeInstanceOf(Response);
  });
});
