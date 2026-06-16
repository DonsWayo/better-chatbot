"use server";
import { mcpClientsManager } from "lib/ai/mcp/mcp-manager";
import { z } from "zod";

import { type ActionResult, toActionResult } from "app-types/util";
import { getUserPrimaryTeamId } from "lib/admin/teams";
import {
  findOpenLocalMcpArmRequest,
  resolveOpenLocalMcpArmRequests,
} from "lib/agent-platform/approvals";
import {
  MCP_CONNECTION_ERROR_MESSAGE,
  isMcpConnectionError,
} from "lib/ai/mcp/connection-error";
import { isMaybeStdioConfig } from "lib/ai/mcp/is-mcp-config";
import { resolveLocalMcpPolicy } from "lib/ai/mcp/local-policy";
import {
  canCreateMCP,
  canManageMCPServer,
  canShareMCPServer,
  getCurrentUser,
} from "lib/auth/permissions";
import { writeAuditLog } from "lib/compliance/audit";
import { IS_MCP_SERVER_REMOTE_ONLY } from "lib/const";
import { McpServerTable } from "lib/db/pg/schema.pg";
import { mcpOAuthRepository, mcpRepository } from "lib/db/repository";

export async function isMcpServerRemoteOnlyAction() {
  return IS_MCP_SERVER_REMOTE_ONLY;
}

export async function selectMcpClientsAction() {
  // Get current user to filter MCP servers
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return [];
  }

  // Get all MCP servers the user can access (their own + shared)
  const accessibleServers = await mcpRepository.selectAllForUser(
    currentUser.id,
  );
  const accessibleIds = new Set(accessibleServers.map((s) => s.id));

  // Get all active clients and filter to only accessible ones
  const list = await mcpClientsManager.getClients();
  return list
    .filter(({ id }) => accessibleIds.has(id))
    .map(({ client, id }) => {
      const server = accessibleServers.find((s) => s.id === id);
      return {
        ...client.getInfo(),
        id,
        userId: server?.userId,
        visibility: server?.visibility,
        isOwner: server?.userId === currentUser.id,
        canManage: server
          ? server.userId === currentUser.id || currentUser.role === "admin"
          : false,
      };
    });
}

export async function selectMcpClientAction(id: string) {
  const client = await mcpClientsManager.getClient(id);
  if (!client) {
    throw new Error("Client not found");
  }
  return {
    ...client.client.getInfo(),
    id,
  };
}

export type SaveMcpClientResult =
  | { success: true; id: string }
  | {
      success: false;
      error: string;
      /**
       * Coarse error class so callers (e.g. the REST POST) can pick the right
       * HTTP status without re-parsing the message. "connection" = the target
       * MCP server URL was unreachable (a client/validation error → 4xx, never
       * a 500); "other" = a validation/authorization/unexpected failure.
       */
      kind: "connection" | "other";
    };

/**
 * Saves (creates or updates) an MCP connector.
 *
 * Returns a structured result instead of throwing: in production Next.js
 * masks errors thrown from Server Actions into an opaque 500 ("digest")
 * response, so the client would never see WHY the save failed (permission
 * denial, validation error, unreachable server URL, ...). Returning the
 * message keeps it user-readable across the RSC boundary.
 */
export async function saveMcpClientAction(
  server: typeof McpServerTable.$inferInsert,
): Promise<SaveMcpClientResult> {
  try {
    const id = await saveMcpClientOrThrow(server);
    return { success: true, id };
  } catch (error) {
    // An unreachable / non-responsive server URL is a CLIENT error, not a
    // server bug. The transport layer throws a raw message that leaks
    // internals (ECONNREFUSED, the host/port, "fetch failed", "SSE error",
    // a stack-class name) — never surface that. Map it to a clean, user-safe
    // message and tag it "connection" so the REST POST returns a 4xx.
    if (isMcpConnectionError(error)) {
      return {
        success: false,
        error: MCP_CONNECTION_ERROR_MESSAGE,
        kind: "connection",
      };
    }
    const message =
      error instanceof Error && error.message
        ? error.message
        : "Failed to save the MCP connection. Please try again.";
    return { success: false, error: message, kind: "other" };
  }
}

async function saveMcpClientOrThrow(
  server: typeof McpServerTable.$inferInsert,
): Promise<string> {
  if (process.env.NOT_ALLOW_ADD_MCP_SERVERS) {
    throw new Error("Not allowed to add MCP servers");
  }

  // Get current user
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    throw new Error("You must be logged in to create MCP connections");
  }

  // Check if user has permission to create/edit MCP connections
  const hasPermission = await canCreateMCP();
  if (!hasPermission) {
    throw new Error("You don't have permission to create MCP connections");
  }

  // IDOR: when updating an EXISTING server (id supplied), canCreateMCP() alone
  // is not enough — it's a role check, not an ownership check. Without this an
  // editor could pass any server's id and overwrite its config (incl.
  // admin-registered org/team connectors used by everyone), repointing the URL
  // or injecting auth headers — a credential/data interception vector. Require
  // manage rights on the existing row, exactly like removeMcpClientAction.
  if (server.id) {
    const existing = await mcpRepository.selectById(server.id);
    if (existing) {
      const canManage = await canManageMCPServer(
        existing.userId,
        existing.visibility,
      );
      if (!canManage) {
        throw new Error(
          "You don't have permission to edit this MCP connection",
        );
      }
    }
  }

  // Cloud deployments are remote-only (like claude.ai web): local stdio
  // servers would spawn arbitrary processes inside the shared server. Local
  // servers are only available in the desktop app / local dev.
  if (IS_MCP_SERVER_REMOTE_ONLY && isMaybeStdioConfig(server.config)) {
    throw new Error(
      "Local (stdio) MCP servers are not supported on this deployment. " +
        "Connect to a remote MCP server URL instead — local servers are only available in the desktop app.",
    );
  }

  // Even where stdio is technically possible (desktop / local dev), the
  // local-MCP governance plane (ADR-0010) is default-deny: the org — or the
  // user's team via override — must be entitled before a stdio config can be
  // saved.
  if (!IS_MCP_SERVER_REMOTE_ONLY && isMaybeStdioConfig(server.config)) {
    const teamId = await getUserPrimaryTeamId(currentUser.id);
    const localMcpAllowed = await resolveLocalMcpPolicy(teamId);
    if (!localMcpAllowed) {
      throw new Error(
        "Local (stdio) MCP servers are disabled by your organization's policy. " +
          'Ask an administrator to enable "Local MCP (desktop)" under Admin → Feature flags, ' +
          "or to set a team override — then try again.",
      );
    }
  }

  // Org-scope and team-scope MCP servers are admin-only
  if (server.scope === "org" || server.scope === "team") {
    if (currentUser.role !== "admin") {
      throw new Error(
        "Only administrators can register org-wide or team-scoped MCP servers",
      );
    }
  }
  // Validate name to ensure it only contains alphanumeric characters and hyphens
  const nameSchema = z.string().regex(/^[a-zA-Z0-9\-]+$/, {
    message:
      "Name must contain only alphanumeric characters (A-Z, a-z, 0-9) and hyphens (-)",
  });

  const result = nameSchema.safeParse(server.name);
  if (!result.success) {
    throw new Error(
      "Name must contain only alphanumeric characters (A-Z, a-z, 0-9) and hyphens (-)",
    );
  }

  // Check for duplicate names if creating a featured server
  if (server.visibility === "public") {
    // Only admins can create featured MCP servers
    const canShare = await canShareMCPServer();
    if (!canShare) {
      throw new Error("Only administrators can feature MCP servers");
    }

    // Check if a featured server with this name already exists
    const existing = await mcpRepository.existsByServerName(server.name);
    if (existing && !server.id) {
      throw new Error("A featured MCP server with this name already exists");
    }
  }

  // Add userId to the server object
  const serverWithUser = {
    ...server,
    userId: currentUser.id,
    visibility: server.visibility || "private",
  };

  // persistClient resolves to the persisted server's id (a plain string).
  // It must NOT return the live MCP client — that holds a back-reference to
  // the manager (a circular graph), and a Server Action returning it makes
  // Next.js blow the stack serializing it across the RSC boundary.
  // Note: persistClient also CONNECTS to the server; an unreachable URL
  // rejects here and surfaces as a structured error to the caller.
  return mcpClientsManager.persistClient(serverWithUser);
}

export async function existMcpClientByServerNameAction(serverName: string) {
  return await mcpRepository.existsByServerName(serverName);
}

export async function removeMcpClientAction(id: string) {
  // Get the MCP server to check ownership
  const mcpServer = await mcpRepository.selectById(id);
  if (!mcpServer) {
    throw new Error("MCP server not found");
  }

  // Check if user has permission to delete this specific MCP server
  const canManage = await canManageMCPServer(
    mcpServer.userId,
    mcpServer.visibility,
  );
  if (!canManage) {
    throw new Error("You don't have permission to delete this MCP connection");
  }

  await mcpClientsManager.removeClient(id);
}

/**
 * Gate for actions that RECONNECT / re-authorize / inspect OAuth state of a
 * specific connector. These mutate server-side connection state, so they need
 * the same owner/admin gate used for editing or deleting the server
 * (canManageMCPServer). Throws on missing session, unknown server, or denial.
 */
async function assertCanManageServerById(id: string) {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    throw new Error("You must be logged in");
  }
  const mcpServer = await mcpRepository.selectById(id);
  if (!mcpServer) {
    throw new Error("MCP server not found");
  }
  const canManage = await canManageMCPServer(
    mcpServer.userId,
    mcpServer.visibility,
  );
  if (!canManage) {
    throw new Error("You don't have permission to manage this MCP connection");
  }
  return mcpServer;
}

/**
 * Gate for actions that INVOKE a tool. The caller must be able to access the
 * server (own it, be a member of a team it's shared with, it's public/featured,
 * or be an admin) — the same visibility set selectMcpClientsAction filters by.
 */
async function assertCanUseServerById(id: string) {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    throw new Error("You must be logged in");
  }
  if (currentUser.role === "admin") return;
  const accessible = await mcpRepository.selectAllForUser(currentUser.id);
  if (!accessible.some((s) => s.id === id)) {
    throw new Error("You don't have access to this MCP connection");
  }
}

export async function refreshMcpClientAction(id: string) {
  await assertCanManageServerById(id);
  await mcpClientsManager.refreshClient(id);
}

export async function authorizeMcpClientAction(id: string) {
  await refreshMcpClientAction(id);
  const client = await mcpClientsManager.getClient(id);
  if (client?.client.status != "authorizing") {
    throw new Error("Not Authorizing");
  }
  return client.client.getAuthorizationUrl()?.toString();
}

export async function checkTokenMcpClientAction(id: string) {
  await assertCanManageServerById(id);
  const session = await mcpOAuthRepository.getAuthenticatedSession(id);

  // for wait connect to mcp server
  await mcpClientsManager.getClient(id).catch(() => null);

  return !!session?.tokens;
}

export async function callMcpToolAction(
  id: string,
  toolName: string,
  input: unknown,
) {
  await assertCanUseServerById(id);
  return mcpClientsManager.toolCall(id, toolName, input);
}

export async function callMcpToolByServerNameAction(
  serverName: string,
  toolName: string,
  input: unknown,
) {
  const server = await mcpRepository.selectByServerName(serverName);
  if (!server) {
    throw new Error("MCP server not found");
  }
  await assertCanUseServerById(server.id);
  return mcpClientsManager.toolCallByServerName(serverName, toolName, input);
}

/**
 * Per-tool entitlement toggle: switch a single tool of a connector on/off.
 * Disabled tools never reach the chat tool list and direct invocations are
 * rejected at the MCP manager layer. Gated by the same canManage check used
 * for editing/deleting the server (owner of a private server, or admin).
 */
export async function setMcpToolEnabledAction(
  serverId: string,
  toolName: string,
  enabled: boolean,
) {
  const parsed = z
    .object({
      serverId: z.string().min(1),
      toolName: z.string().min(1),
      enabled: z.boolean(),
    })
    .parse({ serverId, toolName, enabled });

  const mcpServer = await mcpRepository.selectById(parsed.serverId);
  if (!mcpServer) {
    throw new Error("MCP server not found");
  }

  const canManage = await canManageMCPServer(
    mcpServer.userId,
    mcpServer.visibility,
  );
  if (!canManage) {
    throw new Error(
      "You don't have permission to manage tools on this MCP connection",
    );
  }

  const next = new Set(mcpServer.disabledTools ?? []);
  if (parsed.enabled) {
    next.delete(parsed.toolName);
  } else {
    next.add(parsed.toolName);
  }
  const disabledTools = Array.from(next);

  // Persist (bumps updatedAt) and update the in-memory gate so enforcement
  // applies immediately without a client refresh.
  await mcpRepository.updateDisabledTools(parsed.serverId, disabledTools);
  mcpClientsManager.setDisabledTools(parsed.serverId, disabledTools);

  return { disabledTools };
}

/**
 * Local-MCP consent status (ADR-0010) of a local (stdio) connector for the
 * current viewer — whether the org/team policy allows local tools at all,
 * whether the server is currently armed for this server session, and whether
 * a v2 approval request ("local_mcp_arm") is waiting in the Inbox.
 */
export async function getLocalMcpStatusAction(serverId: string) {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    throw new Error("You must be logged in");
  }
  const mcpServer = await mcpRepository.selectById(serverId);
  if (!mcpServer) {
    throw new Error("MCP server not found");
  }
  if (!isMaybeStdioConfig(mcpServer.config)) {
    return {
      isStdio: false as const,
      policyEnabled: false,
      armed: false,
      armedUntil: null as number | null,
      pendingApprovalId: null as string | null,
    };
  }
  const teamId = await getUserPrimaryTeamId(currentUser.id);
  const policyEnabled = await resolveLocalMcpPolicy(teamId);
  const armedUntil = mcpClientsManager.localServerArmedUntil(serverId);
  // v2 consent: requests are owner-targeted, so look up by the server owner
  // (which is the viewer when the owner is looking — the common case).
  const openRequest = await findOpenLocalMcpArmRequest(
    serverId,
    mcpServer.userId,
  ).catch(() => null);
  return {
    isStdio: true as const,
    policyEnabled,
    armed: armedUntil !== null,
    armedUntil,
    pendingApprovalId: openRequest?.id ?? null,
  };
}

/**
 * Arms a local (stdio) server for this server session: its tools may execute
 * until the arming window (8h) expires. Session-gated — only users who can
 * manage the server (owner / admin) and whose org/team policy allows local
 * MCP may arm. Arming is written to the compliance audit log.
 *
 * Returns a structured {@link ActionResult} rather than throwing: the
 * admin-facing instruction ('Ask an administrator to enable "Local MCP
 * (desktop)" …') is precisely what the user needs to act on, and production
 * Next.js would otherwise mask the thrown error into an opaque 500.
 */
export async function armLocalMcpServerAction(
  serverId: string,
): Promise<ActionResult<{ armedUntil: number }>> {
  return toActionResult(() => armLocalMcpServerOrThrow(serverId));
}

async function armLocalMcpServerOrThrow(serverId: string) {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    throw new Error("You must be logged in to enable local tools");
  }
  const mcpServer = await mcpRepository.selectById(serverId);
  if (!mcpServer) {
    throw new Error("MCP server not found");
  }
  if (!isMaybeStdioConfig(mcpServer.config)) {
    throw new Error("Only local (stdio) MCP servers require arming");
  }
  const canManage = await canManageMCPServer(
    mcpServer.userId,
    mcpServer.visibility,
  );
  if (!canManage) {
    throw new Error(
      "You don't have permission to enable local tools for this connector",
    );
  }
  const teamId = await getUserPrimaryTeamId(currentUser.id);
  const policyEnabled = await resolveLocalMcpPolicy(teamId);
  if (!policyEnabled) {
    throw new Error(
      "Local (stdio) MCP tools are disabled by your organization's policy. " +
        'Ask an administrator to enable "Local MCP (desktop)" under Admin → Feature flags.',
    );
  }

  const armedUntil = mcpClientsManager.armLocalServer(serverId, {
    grantedBy: currentUser.id,
  });
  // v2 consent: direct arming is an implicit approval — resolve any open
  // "local_mcp_arm" request for this server+owner so the Inbox doesn't keep
  // showing a stale request. Fail-soft: arming must not depend on it.
  const resolvedRequestIds = await resolveOpenLocalMcpArmRequests(
    serverId,
    mcpServer.userId,
    { decidedBy: currentUser.id },
  ).catch(() => [] as string[]);
  void writeAuditLog({
    userId: currentUser.id,
    teamId,
    eventType: "admin_action",
    details: {
      action: "local_mcp_server_armed",
      serverId,
      serverName: mcpServer.name,
      armedUntil,
      resolvedApprovalRequestIds: resolvedRequestIds,
    },
  });
  return { armedUntil };
}

export async function shareMcpServerAction(
  id: string,
  visibility: "public" | "private",
) {
  // Only admins can feature MCP servers
  const canShare = await canShareMCPServer();
  if (!canShare) {
    throw new Error("Only administrators can feature MCP servers");
  }

  // Update the visibility of the MCP server
  await mcpRepository.updateVisibility(id, visibility);

  return { success: true };
}
