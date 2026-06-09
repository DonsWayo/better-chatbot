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
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns 401 when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    const res = await GET({} as Request, { params: Promise.resolve({ server: "srv-1" }) });
    expect(res.status).toBe(401);
  });

  it("returns tool customizations for authenticated user", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    const CUSTOMIZATIONS = [{ toolName: "search", prompt: "Search carefully" }];
    selectByUserIdAndMcpServerIdMock.mockResolvedValueOnce(CUSTOMIZATIONS);
    const { GET } = await import("./route");
    const res = await GET({} as Request, { params: Promise.resolve({ server: "srv-1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
  });
});
