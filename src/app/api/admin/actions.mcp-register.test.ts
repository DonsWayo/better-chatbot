import type { MCPServerConfig, MCPToolInfo } from "app-types/mcp";
import type { McpConnectionTestResult } from "lib/admin/mcp-connection-test";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Hoisted mocks ───────────────────────────────────────────────────────────────
// `registerCompanyMcpServerAction` is the orchestration seam where the team-scope
// guard lives and where probe outcomes are translated into persisted status. We
// mock every collaborator so we can assert precisely what it hands to
// registerMcpServer (the regression boundary for the "missing teamId" bug).

const getSessionMock = vi.fn();
const testMcpServerConnectionMock =
  vi.fn<() => Promise<McpConnectionTestResult>>();
const registerMcpServerMock = vi.fn();

// `lib/auth/server` and `auth/server` resolve to the same module (src/lib/auth/server)
// via tsconfig path aliases, so a single mock must satisfy both import specifiers.
vi.mock("lib/auth/server", () => ({
  getSession: getSessionMock,
  auth: { api: {} },
}));
vi.mock("auth/server", () => ({
  getSession: getSessionMock,
  auth: { api: {} },
}));

vi.mock("lib/admin/mcp-connection-test", () => ({
  testMcpServerConnection: testMcpServerConnectionMock,
}));

vi.mock("lib/admin/mcp-servers", () => ({
  registerMcpServer: registerMcpServerMock,
  // The action module re-exports/imports these too; provide harmless stubs so
  // the module under test loads without pulling the real DB-backed source.
  updateMcpServer: vi.fn(),
  deleteMcpServer: vi.fn(),
}));

// actions.ts is a "use server" module that also imports auth/server, next/headers,
// next-intl, and several admin libs at the top level. Stub the ones that would
// otherwise hit server-only / DB code so the import succeeds in isolation.
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async () => (k: string) => k),
}));
vi.mock("lib/action-utils", () => ({
  validatedActionWithAdminPermission: (_schema: unknown, fn: unknown) => fn,
}));
vi.mock("lib/admin/feature-flags", () => ({ upsertFeatureFlag: vi.fn() }));
vi.mock("lib/admin/rate-limit", () => ({ resetUserRateLimit: vi.fn() }));
vi.mock("lib/admin/user-grants", () => ({
  grantUserModel: vi.fn(),
  revokeUserModelGrant: vi.fn(),
  listUserModelGrants: vi.fn(),
}));
vi.mock("lib/compliance/gdpr", () => ({ eraseUserData: vi.fn() }));
vi.mock("lib/logger", () => ({ default: { error: vi.fn(), info: vi.fn() } }));
vi.mock("lib/user/server", () => ({ getUser: vi.fn() }));

const CONFIG: MCPServerConfig = {
  url: "https://example.com/mcp",
} as unknown as MCPServerConfig;

const TOOL_INFO: MCPToolInfo[] = [{ name: "search", description: "Search" }];

const ADMIN_SESSION = { user: { id: "admin-1", role: "admin" } };

function okProbe(): McpConnectionTestResult {
  return { ok: true, toolCount: 1, toolInfo: TOOL_INFO };
}

beforeEach(() => {
  vi.clearAllMocks();
  getSessionMock.mockResolvedValue(ADMIN_SESSION);
  testMcpServerConnectionMock.mockResolvedValue(okProbe());
  registerMcpServerMock.mockImplementation(async (input: unknown) => ({
    id: "srv-1",
    ...(input as Record<string, unknown>),
  }));
});

describe("registerCompanyMcpServerAction — authorization", () => {
  it("throws 'Unauthorized' when there is no session", async () => {
    getSessionMock.mockResolvedValue(null);
    const { registerCompanyMcpServerAction } = await import("./actions");

    await expect(
      registerCompanyMcpServerAction({
        name: "x",
        scope: "org",
        config: CONFIG,
        enabled: true,
      }),
    ).rejects.toThrow("Unauthorized");

    expect(testMcpServerConnectionMock).not.toHaveBeenCalled();
    expect(registerMcpServerMock).not.toHaveBeenCalled();
  });

  it("throws 'Admin required' when the session role is not admin", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u-1", role: "user" } });
    const { registerCompanyMcpServerAction } = await import("./actions");

    await expect(
      registerCompanyMcpServerAction({
        name: "x",
        scope: "org",
        config: CONFIG,
        enabled: true,
      }),
    ).rejects.toThrow("Admin required");

    expect(registerMcpServerMock).not.toHaveBeenCalled();
  });
});

describe("registerCompanyMcpServerAction — team requirement", () => {
  it("throws when scope=team and teamIds is missing", async () => {
    const { registerCompanyMcpServerAction } = await import("./actions");

    await expect(
      registerCompanyMcpServerAction({
        name: "team-mcp",
        scope: "team",
        config: CONFIG,
        enabled: true,
      }),
    ).rejects.toThrow("At least one team is required when scope=team");

    expect(testMcpServerConnectionMock).not.toHaveBeenCalled();
    expect(registerMcpServerMock).not.toHaveBeenCalled();
  });

  it("throws when scope=team and teamIds is an empty array", async () => {
    const { registerCompanyMcpServerAction } = await import("./actions");

    await expect(
      registerCompanyMcpServerAction({
        name: "team-mcp",
        scope: "team",
        teamIds: [],
        config: CONFIG,
        enabled: true,
      }),
    ).rejects.toThrow("At least one team is required when scope=team");

    expect(registerMcpServerMock).not.toHaveBeenCalled();
  });
});

describe("registerCompanyMcpServerAction — org scope happy path", () => {
  it("does not require teams; probes; returns {server, connection} with connected status", async () => {
    const { registerCompanyMcpServerAction } = await import("./actions");

    const result = await registerCompanyMcpServerAction({
      name: "org-mcp",
      scope: "org",
      config: CONFIG,
      enabled: true,
    });

    expect(testMcpServerConnectionMock).toHaveBeenCalledTimes(1);
    expect(testMcpServerConnectionMock).toHaveBeenCalledWith(CONFIG);

    expect(registerMcpServerMock).toHaveBeenCalledTimes(1);
    expect(registerMcpServerMock).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "org-mcp",
        scope: "org",
        userId: "admin-1",
        lastConnectionStatus: "connected",
        toolInfo: TOOL_INFO,
      }),
    );

    expect(result.connection.ok).toBe(true);
    expect(result.server).toEqual(expect.objectContaining({ id: "srv-1" }));
  });
});

describe("registerCompanyMcpServerAction — team scope passthrough", () => {
  it("passes teamIds through to registerMcpServer unchanged", async () => {
    const { registerCompanyMcpServerAction } = await import("./actions");

    await registerCompanyMcpServerAction({
      name: "team-mcp",
      scope: "team",
      teamIds: ["team-a", "team-b"],
      config: CONFIG,
      enabled: true,
    });

    expect(registerMcpServerMock).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: "team",
        teamIds: ["team-a", "team-b"],
        userId: "admin-1",
      }),
    );
  });
});

describe("registerCompanyMcpServerAction — probe outcome mapping", () => {
  it("needsAuth probe → lastConnectionStatus null and connection.needsAuth true", async () => {
    testMcpServerConnectionMock.mockResolvedValue({
      ok: false,
      needsAuth: true,
      error: "needs auth",
    });
    const { registerCompanyMcpServerAction } = await import("./actions");

    const result = await registerCompanyMcpServerAction({
      name: "oauth-mcp",
      scope: "org",
      config: CONFIG,
      enabled: true,
    });

    expect(registerMcpServerMock).toHaveBeenCalledWith(
      expect.objectContaining({
        lastConnectionStatus: null,
        toolInfo: null,
      }),
    );
    expect(result.connection.needsAuth).toBe(true);
    expect(result.server).toEqual(expect.objectContaining({ id: "srv-1" }));
  });

  it("failed probe (ok:false, no needsAuth) → lastConnectionStatus 'error'; server still returned", async () => {
    testMcpServerConnectionMock.mockResolvedValue({
      ok: false,
      error: "Connection status: disconnected",
    });
    const { registerCompanyMcpServerAction } = await import("./actions");

    const result = await registerCompanyMcpServerAction({
      name: "broken-mcp",
      scope: "org",
      config: CONFIG,
      enabled: true,
    });

    expect(registerMcpServerMock).toHaveBeenCalledWith(
      expect.objectContaining({
        lastConnectionStatus: "error",
        toolInfo: null,
      }),
    );
    expect(result.connection.ok).toBe(false);
    expect(result.server).toEqual(expect.objectContaining({ id: "srv-1" }));
  });

  it("ok probe with no toolInfo → toolInfo null is persisted", async () => {
    testMcpServerConnectionMock.mockResolvedValue({ ok: true, toolCount: 0 });
    const { registerCompanyMcpServerAction } = await import("./actions");

    await registerCompanyMcpServerAction({
      name: "no-tools-mcp",
      scope: "org",
      config: CONFIG,
      enabled: true,
    });

    expect(registerMcpServerMock).toHaveBeenCalledWith(
      expect.objectContaining({
        lastConnectionStatus: "connected",
        toolInfo: null,
      }),
    );
  });
});
