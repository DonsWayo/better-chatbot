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
import { getSession } from "lib/auth/server";
import { eraseUserData } from "lib/compliance/gdpr";
import logger from "lib/logger";
import {
  setOrgMemoryEnabled,
  setOrgMemoryImplicitExtraction,
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
