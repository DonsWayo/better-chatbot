"use server";

import { DEFAULT_USER_ROLE, userRolesInfo } from "app-types/roles";
import { auth } from "auth/server";
import { validatedActionWithAdminPermission } from "lib/action-utils";
import { upsertFeatureFlag } from "lib/admin/feature-flags";
import {
  type McpConnectionTestResult,
  testMcpServerConnection,
} from "lib/admin/mcp-connection-test";
import {
  type PatchMcpServerInput,
  type RegisterMcpServerInput,
  deleteMcpServer,
  registerMcpServer,
  updateMcpServer,
} from "lib/admin/mcp-servers";
import { resetUserRateLimit } from "lib/admin/rate-limit";
import {
  grantUserModel,
  listUserModelGrants,
  revokeUserModelGrant,
} from "lib/admin/user-grants";
import {
  isLocalMcpRuntimeEnabled,
  setOrgLocalMcpEnabled,
  setTeamLocalMcpEnabled,
} from "lib/ai/mcp/local-policy";
import {
  type EntraTeamMapping,
  parseEntraTeamMappings,
  setEntraTeamMappings,
} from "lib/auth/entra-team-mappings";
import { getSession } from "lib/auth/server";
import { eraseUserData } from "lib/compliance/gdpr";
import logger from "lib/logger";
import {
  setOrgMemoryEnabled,
  setOrgMemoryImplicitExtraction,
  setTeamMemoryEnabled,
  setTeamMemoryImplicitExtraction,
} from "lib/memory/policy";
import { getUser } from "lib/user/server";
import { getTranslations } from "next-intl/server";
import { headers } from "next/headers";
import {
  UpdateUserBanStatusActionState,
  UpdateUserBanStatusSchema,
  UpdateUserRoleActionState,
  UpdateUserRoleSchema,
} from "./validations";

export const updateUserRolesAction = validatedActionWithAdminPermission(
  UpdateUserRoleSchema,
  async (data, _formData, userSession): Promise<UpdateUserRoleActionState> => {
    const t = await getTranslations("Admin.UserRoles");
    const tCommon = await getTranslations("User.Profile.common");
    const { userId, role: roleInput } = data;

    const role = roleInput || DEFAULT_USER_ROLE;
    if (userSession.user.id === userId) {
      return {
        success: false,
        message: t("cannotUpdateOwnRole"),
      };
    }
    await auth.api.setRole({
      body: { userId, role: role as "user" | "admin" },
      headers: await headers(),
    });
    await auth.api.revokeUserSessions({
      body: { userId },
      headers: await headers(),
    });
    const user = await getUser(userId);
    if (!user) {
      return {
        success: false,
        message: tCommon("userNotFound"),
      };
    }

    return {
      success: true,
      message: t("roleUpdatedSuccessfullyTo", {
        role: userRolesInfo[role].label,
      }),
      user,
    };
  },
);

export const updateUserBanStatusAction = validatedActionWithAdminPermission(
  UpdateUserBanStatusSchema,
  async (
    data,
    _formData,
    userSession,
  ): Promise<UpdateUserBanStatusActionState> => {
    const tCommon = await getTranslations("User.Profile.common");
    const { userId, banned, banReason } = data;

    if (userSession.user.id === userId) {
      return {
        success: false,
        message: tCommon("cannotBanUnbanYourself"),
      };
    }
    try {
      if (!banned) {
        await auth.api.banUser({
          body: {
            userId,
            banReason:
              banReason ||
              (await getTranslations("User.Profile.common"))("bannedByAdmin"),
          },
          headers: await headers(),
        });
        await auth.api.revokeUserSessions({
          body: { userId },
          headers: await headers(),
        });
      } else {
        await auth.api.unbanUser({
          body: { userId },
          headers: await headers(),
        });
      }
      const user = await getUser(userId);
      if (!user) {
        return {
          success: false,
          message: tCommon("userNotFound"),
        };
      }
      return {
        success: true,
        message: user.banned
          ? tCommon("userBannedSuccessfully")
          : tCommon("userUnbannedSuccessfully"),
        user,
      };
    } catch (error) {
      logger.error(error);
      return {
        success: false,
        message: tCommon("failedToUpdateUserStatus"),
        error: error instanceof Error ? error.message : tCommon("unknownError"),
      };
    }
  },
);

// ── Feature flags ────────────────────────────────────────────────────────────

export async function toggleFeatureFlagAction(
  name: string,
  enabled: boolean,
): Promise<void> {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  if (session.user.role !== "admin") throw new Error("Admin required");
  await upsertFeatureFlag(name, enabled);
}

// ── User-memory org policy (docs/design/user-memory.md) ─────────────────────
// Layered org→team keys in asafe_org_settings; these toggles set the ORG
// layer. Defaults when unset: memory ON, implicit extraction OFF (legal
// sign-off pending for background extraction in an EU employment context).

export async function updateOrgMemoryPolicyAction(input: {
  enabled?: boolean;
  implicitExtraction?: boolean;
}): Promise<void> {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  if (session.user.role !== "admin") throw new Error("Admin required");
  if (typeof input.enabled === "boolean") {
    await setOrgMemoryEnabled(input.enabled);
  }
  if (typeof input.implicitExtraction === "boolean") {
    await setOrgMemoryImplicitExtraction(input.implicitExtraction);
  }
}

/**
 * Per-team memory-policy override (`team_memory_*:<teamId>` keys). Tri-state
 * per field: `true`/`false` force the value for the team; `null` clears the
 * override back to inherit; `undefined` leaves the field untouched.
 */
export async function updateTeamMemoryPolicyAction(input: {
  teamId: string;
  enabled?: boolean | null;
  implicitExtraction?: boolean | null;
}): Promise<void> {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  if (session.user.role !== "admin") throw new Error("Admin required");
  if (!input.teamId) throw new Error("teamId required");
  if (input.enabled !== undefined) {
    await setTeamMemoryEnabled(input.teamId, input.enabled);
  }
  if (input.implicitExtraction !== undefined) {
    await setTeamMemoryImplicitExtraction(
      input.teamId,
      input.implicitExtraction,
    );
  }
  const { writeAuditLog } = await import("lib/compliance/audit");
  void writeAuditLog({
    userId: session.user.id,
    teamId: input.teamId,
    eventType: "admin_action",
    details: {
      action: "memory_team_policy_updated",
      teamId: input.teamId,
      ...(input.enabled !== undefined && { enabled: input.enabled }),
      ...(input.implicitExtraction !== undefined && {
        implicitExtraction: input.implicitExtraction,
      }),
    },
  });
}

/**
 * Per-team local-MCP override (`team_local_mcp_enabled:<teamId>`). Tri-state:
 * `true`/`false` force; `null` clears back to inherit. Re-resolves the MCP
 * manager's process-wide runtime gate the same way the org action does — a
 * team override can open the gate while the org base is off (and vice versa).
 */
export async function updateTeamLocalMcpPolicyAction(input: {
  teamId: string;
  enabled: boolean | null;
}): Promise<void> {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  if (session.user.role !== "admin") throw new Error("Admin required");
  if (!input.teamId) throw new Error("teamId required");
  await setTeamLocalMcpEnabled(input.teamId, input.enabled);
  const [{ mcpClientsManager }, { writeAuditLog }] = await Promise.all([
    import("lib/ai/mcp/mcp-manager"),
    import("lib/compliance/audit"),
  ]);
  mcpClientsManager.setLocalMcpEnabled(await isLocalMcpRuntimeEnabled());
  void writeAuditLog({
    userId: session.user.id,
    teamId: input.teamId,
    eventType: "admin_action",
    details: {
      action: "local_mcp_team_policy_updated",
      teamId: input.teamId,
      enabled: input.enabled,
    },
  });
}

/**
 * Org-base switch for the local-MCP governance plane (ADR-0010; default-deny
 * per ADR-0009). Persists `local_mcp_enabled` in asafe_org_settings, then
 * flips the MCP manager's in-memory gate so enforcement (tool filtering +
 * call rejection) is immediate. Team overrides live under the
 * `team_local_mcp_enabled:<teamId>` keys — see
 * `updateTeamLocalMcpPolicyAction` above.
 */
export async function updateOrgLocalMcpPolicyAction(input: {
  enabled: boolean;
}): Promise<void> {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  if (session.user.role !== "admin") throw new Error("Admin required");
  await setOrgLocalMcpEnabled(input.enabled);
  // Re-resolve (org base OR any team override) rather than trusting the input
  // — a team override may keep the runtime gate open after an org-base off.
  // Lazy imports: the manager module graph (storage, clients) and the audit
  // sink are heavy and only needed on this rarely-hit admin path.
  const [{ mcpClientsManager }, { writeAuditLog }] = await Promise.all([
    import("lib/ai/mcp/mcp-manager"),
    import("lib/compliance/audit"),
  ]);
  mcpClientsManager.setLocalMcpEnabled(await isLocalMcpRuntimeEnabled());
  void writeAuditLog({
    userId: session.user.id,
    eventType: "admin_action",
    details: {
      action: "local_mcp_org_policy_updated",
      enabled: input.enabled,
    },
  });
}

// ── Entra group → team mappings (Wave 4, ADR-0005) ──────────────────────────
// Replaces the whole `entra_team_mappings` list in asafe_org_settings. The
// SSO sign-in hook (lib/auth/auth-instance.ts) reads it on every sign-in and
// additively ensures membership in mapped teams.

export async function updateEntraTeamMappingsAction(
  mappings: EntraTeamMapping[],
): Promise<EntraTeamMapping[]> {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  if (session.user.role !== "admin") throw new Error("Admin required");
  // Re-validate on the server: drop malformed entries / dedupe pairs.
  const clean = parseEntraTeamMappings(mappings);
  await setEntraTeamMappings(clean);
  const { writeAuditLog } = await import("lib/compliance/audit");
  void writeAuditLog({
    userId: session.user.id,
    eventType: "admin_action",
    details: {
      action: "entra_team_mappings_updated",
      mappingCount: clean.length,
      mappings: clean,
    },
  });
  return clean;
}

// ── Company MCP servers ──────────────────────────────────────────────────────

export interface RegisterCompanyMcpServerResult {
  server: Awaited<ReturnType<typeof registerMcpServer>>;
  connection: McpConnectionTestResult;
}

export async function registerCompanyMcpServerAction(
  input: Omit<
    RegisterMcpServerInput,
    "userId" | "lastConnectionStatus" | "toolInfo"
  >,
): Promise<RegisterCompanyMcpServerResult> {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  if (session.user.role !== "admin") throw new Error("Admin required");
  if (
    input.scope === "team" &&
    (!input.teamIds || input.teamIds.length === 0)
  ) {
    throw new Error("At least one team is required when scope=team");
  }

  // Probe the server before persisting so the admin gets immediate feedback on
  // whether it actually works (handshake + tool listing).
  const connection = await testMcpServerConnection(input.config);

  const server = await registerMcpServer({
    ...input,
    userId: session.user.id,
    lastConnectionStatus: connection.ok
      ? "connected"
      : connection.needsAuth
        ? null
        : "error",
    toolInfo: connection.ok ? (connection.toolInfo ?? null) : null,
  });

  return { server, connection };
}

export async function updateCompanyMcpServerAction(
  id: string,
  patch: PatchMcpServerInput,
) {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  if (session.user.role !== "admin") throw new Error("Admin required");
  const updated = await updateMcpServer(id, patch);
  if (!updated) throw new Error("Server not found");
  return updated;
}

export async function deleteCompanyMcpServerAction(id: string): Promise<void> {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  if (session.user.role !== "admin") throw new Error("Admin required");
  const deletedId = await deleteMcpServer(id);
  if (!deletedId) throw new Error("Server not found");
}

// ── User rate-limit reset ────────────────────────────────────────────────────

export async function resetUserRateLimitAction(
  userId: string,
): Promise<number> {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  if (session.user.role !== "admin") throw new Error("Admin required");
  return resetUserRateLimit(userId);
}

// ── User erasure (GDPR Art. 17) ──────────────────────────────────────────────

export async function eraseUserDataAction(userId: string) {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  if (session.user.role !== "admin") throw new Error("Admin required");
  if (userId === session.user.id)
    throw new Error("Cannot erase your own account.");
  return eraseUserData(userId);
}

// ── User model grants ────────────────────────────────────────────────────────

export async function listUserModelGrantsAction(userId: string) {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  if (session.user.role !== "admin") throw new Error("Admin required");
  return listUserModelGrants(userId);
}

export async function grantUserModelAction(
  userId: string,
  modelId: string,
  expiresAt?: Date | null,
): Promise<void> {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  if (session.user.role !== "admin") throw new Error("Admin required");
  await grantUserModel(userId, modelId, session.user.id, expiresAt);
}

export async function revokeUserModelGrantAction(
  grantId: string,
  userId: string,
): Promise<void> {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  if (session.user.role !== "admin") throw new Error("Admin required");
  await revokeUserModelGrant(grantId, userId);
}
