import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Hoisted mocks (actions.mcp-register.test.ts pattern) ────────────────────
// updateTeamMemoryPolicyAction / updateTeamLocalMcpPolicyAction are the
// admin-gated seams over the layered policy setters. Every collaborator is
// mocked so we can assert: gating, which setters run for which input shape,
// the runtime-gate re-resolution, and the audit-log payload.

const h = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  setTeamMemoryEnabledMock: vi.fn(),
  setTeamMemoryImplicitExtractionMock: vi.fn(),
  setTeamLocalMcpEnabledMock: vi.fn(),
  isLocalMcpRuntimeEnabledMock: vi.fn(),
  setLocalMcpEnabledMock: vi.fn(),
  writeAuditLogMock: vi.fn(),
}));

// `lib/auth/server` and `auth/server` resolve to the same module via tsconfig
// path aliases, so a single mock must satisfy both import specifiers.
vi.mock("lib/auth/server", () => ({
  getSession: h.getSessionMock,
  auth: { api: {} },
}));
vi.mock("auth/server", () => ({
  getSession: h.getSessionMock,
  auth: { api: {} },
}));

vi.mock("lib/memory/policy", () => ({
  setOrgMemoryEnabled: vi.fn(),
  setOrgMemoryImplicitExtraction: vi.fn(),
  setTeamMemoryEnabled: h.setTeamMemoryEnabledMock,
  setTeamMemoryImplicitExtraction: h.setTeamMemoryImplicitExtractionMock,
}));

vi.mock("lib/ai/mcp/local-policy", () => ({
  setOrgLocalMcpEnabled: vi.fn(),
  setTeamLocalMcpEnabled: h.setTeamLocalMcpEnabledMock,
  isLocalMcpRuntimeEnabled: h.isLocalMcpRuntimeEnabledMock,
}));

vi.mock("lib/ai/mcp/mcp-manager", () => ({
  mcpClientsManager: { setLocalMcpEnabled: h.setLocalMcpEnabledMock },
}));

vi.mock("lib/compliance/audit", () => ({
  writeAuditLog: h.writeAuditLogMock,
}));

// actions.ts is a "use server" module with a wide top-level import graph.
// Stub everything that would otherwise hit server-only / DB code.
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async () => (k: string) => k),
}));
vi.mock("lib/action-utils", () => ({
  validatedActionWithAdminPermission: (_schema: unknown, fn: unknown) => fn,
}));
vi.mock("lib/admin/feature-flags", () => ({ upsertFeatureFlag: vi.fn() }));
vi.mock("lib/admin/mcp-connection-test", () => ({
  testMcpServerConnection: vi.fn(),
}));
vi.mock("lib/admin/mcp-servers", () => ({
  registerMcpServer: vi.fn(),
  updateMcpServer: vi.fn(),
  deleteMcpServer: vi.fn(),
}));
vi.mock("lib/admin/rate-limit", () => ({ resetUserRateLimit: vi.fn() }));
vi.mock("lib/admin/user-grants", () => ({
  grantUserModel: vi.fn(),
  revokeUserModelGrant: vi.fn(),
  listUserModelGrants: vi.fn(),
}));
vi.mock("lib/compliance/gdpr", () => ({ eraseUserData: vi.fn() }));
vi.mock("lib/logger", () => ({ default: { error: vi.fn(), info: vi.fn() } }));
vi.mock("lib/user/server", () => ({ getUser: vi.fn() }));

const ADMIN_SESSION = { user: { id: "admin-1", role: "admin" } };

beforeEach(() => {
  vi.clearAllMocks();
  h.getSessionMock.mockResolvedValue(ADMIN_SESSION);
  h.isLocalMcpRuntimeEnabledMock.mockResolvedValue(true);
  h.writeAuditLogMock.mockResolvedValue(undefined);
});

describe("updateTeamMemoryPolicyAction — authorization", () => {
  it("throws 'Unauthorized' without a session", async () => {
    h.getSessionMock.mockResolvedValue(null);
    const { updateTeamMemoryPolicyAction } = await import("./actions");

    await expect(
      updateTeamMemoryPolicyAction({ teamId: "t1", enabled: true }),
    ).rejects.toThrow("Unauthorized");
    expect(h.setTeamMemoryEnabledMock).not.toHaveBeenCalled();
  });

  it("throws 'Admin required' for a non-admin session", async () => {
    h.getSessionMock.mockResolvedValue({ user: { id: "u-1", role: "user" } });
    const { updateTeamMemoryPolicyAction } = await import("./actions");

    await expect(
      updateTeamMemoryPolicyAction({ teamId: "t1", enabled: true }),
    ).rejects.toThrow("Admin required");
    expect(h.setTeamMemoryEnabledMock).not.toHaveBeenCalled();
    expect(h.writeAuditLogMock).not.toHaveBeenCalled();
  });

  it("rejects an empty teamId", async () => {
    const { updateTeamMemoryPolicyAction } = await import("./actions");
    await expect(
      updateTeamMemoryPolicyAction({ teamId: "", enabled: true }),
    ).rejects.toThrow("teamId required");
    expect(h.setTeamMemoryEnabledMock).not.toHaveBeenCalled();
  });
});

describe("updateTeamMemoryPolicyAction — setter dispatch", () => {
  it("sets only `enabled` when only `enabled` is provided", async () => {
    const { updateTeamMemoryPolicyAction } = await import("./actions");
    await updateTeamMemoryPolicyAction({ teamId: "t1", enabled: false });

    expect(h.setTeamMemoryEnabledMock).toHaveBeenCalledWith("t1", false);
    expect(h.setTeamMemoryImplicitExtractionMock).not.toHaveBeenCalled();
  });

  it("sets only `implicitExtraction` when only it is provided", async () => {
    const { updateTeamMemoryPolicyAction } = await import("./actions");
    await updateTeamMemoryPolicyAction({
      teamId: "t1",
      implicitExtraction: true,
    });

    expect(h.setTeamMemoryImplicitExtractionMock).toHaveBeenCalledWith(
      "t1",
      true,
    );
    expect(h.setTeamMemoryEnabledMock).not.toHaveBeenCalled();
  });

  it("clears overrides with null (back to inherit) for both fields", async () => {
    const { updateTeamMemoryPolicyAction } = await import("./actions");
    await updateTeamMemoryPolicyAction({
      teamId: "t1",
      enabled: null,
      implicitExtraction: null,
    });

    expect(h.setTeamMemoryEnabledMock).toHaveBeenCalledWith("t1", null);
    expect(h.setTeamMemoryImplicitExtractionMock).toHaveBeenCalledWith(
      "t1",
      null,
    );
  });

  it("audit-logs the change with team attribution and only the touched fields", async () => {
    const { updateTeamMemoryPolicyAction } = await import("./actions");
    await updateTeamMemoryPolicyAction({ teamId: "t1", enabled: true });

    expect(h.writeAuditLogMock).toHaveBeenCalledWith({
      userId: "admin-1",
      teamId: "t1",
      eventType: "admin_action",
      details: {
        action: "memory_team_policy_updated",
        teamId: "t1",
        enabled: true,
      },
    });
  });
});

describe("updateTeamLocalMcpPolicyAction — authorization", () => {
  it("throws 'Unauthorized' without a session", async () => {
    h.getSessionMock.mockResolvedValue(null);
    const { updateTeamLocalMcpPolicyAction } = await import("./actions");

    await expect(
      updateTeamLocalMcpPolicyAction({ teamId: "t1", enabled: true }),
    ).rejects.toThrow("Unauthorized");
    expect(h.setTeamLocalMcpEnabledMock).not.toHaveBeenCalled();
  });

  it("throws 'Admin required' for a non-admin session", async () => {
    h.getSessionMock.mockResolvedValue({ user: { id: "u-1", role: "user" } });
    const { updateTeamLocalMcpPolicyAction } = await import("./actions");

    await expect(
      updateTeamLocalMcpPolicyAction({ teamId: "t1", enabled: true }),
    ).rejects.toThrow("Admin required");
    expect(h.setTeamLocalMcpEnabledMock).not.toHaveBeenCalled();
    expect(h.setLocalMcpEnabledMock).not.toHaveBeenCalled();
  });
});

describe("updateTeamLocalMcpPolicyAction — setter, runtime gate, audit", () => {
  it("persists the override and re-resolves the manager gate", async () => {
    h.isLocalMcpRuntimeEnabledMock.mockResolvedValue(true);
    const { updateTeamLocalMcpPolicyAction } = await import("./actions");
    await updateTeamLocalMcpPolicyAction({ teamId: "t1", enabled: true });

    expect(h.setTeamLocalMcpEnabledMock).toHaveBeenCalledWith("t1", true);
    expect(h.isLocalMcpRuntimeEnabledMock).toHaveBeenCalled();
    expect(h.setLocalMcpEnabledMock).toHaveBeenCalledWith(true);
  });

  it("re-resolves (not trusts) the gate when clearing an override", async () => {
    // Clearing the last team override with the org base off must close the
    // gate — the manager value comes from isLocalMcpRuntimeEnabled, not input.
    h.isLocalMcpRuntimeEnabledMock.mockResolvedValue(false);
    const { updateTeamLocalMcpPolicyAction } = await import("./actions");
    await updateTeamLocalMcpPolicyAction({ teamId: "t1", enabled: null });

    expect(h.setTeamLocalMcpEnabledMock).toHaveBeenCalledWith("t1", null);
    expect(h.setLocalMcpEnabledMock).toHaveBeenCalledWith(false);
  });

  it("audit-logs the change with team attribution", async () => {
    const { updateTeamLocalMcpPolicyAction } = await import("./actions");
    await updateTeamLocalMcpPolicyAction({ teamId: "t1", enabled: false });

    expect(h.writeAuditLogMock).toHaveBeenCalledWith({
      userId: "admin-1",
      teamId: "t1",
      eventType: "admin_action",
      details: {
        action: "local_mcp_team_policy_updated",
        teamId: "t1",
        enabled: false,
      },
    });
  });
});
