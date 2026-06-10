/**
 * asafe-ai Wave 5: MCP tool invocation audit logging (ADR-0005 security)
 *
 * auditMcpInvocation – fire-and-forget; writes one row per MCP tool call.
 * Never throws — audit failure must not block inference.
 */

import { pgDb as db } from "@/lib/db/pg/db.pg";
import { AsafeMcpInvocationLogTable } from "@/lib/db/pg/schema.pg";
import globalLogger from "logger";

const logger = globalLogger.withDefaults({ message: "mcp-audit: " });

interface AuditMcpCallParams {
  userId: string;
  teamId?: string | null;
  /** Set for local (stdio) invocations audited at the manager layer. */
  mcpServerId?: string | null;
  toolName: string;
  outcome: "success" | "error";
  durationMs?: number;
}

export async function auditMcpInvocation(
  params: AuditMcpCallParams,
): Promise<void> {
  try {
    await db.insert(AsafeMcpInvocationLogTable).values({
      userId: params.userId,
      teamId: params.teamId ?? null,
      mcpServerId: params.mcpServerId ?? null,
      toolName: params.toolName,
      outcome: params.outcome,
      durationMs: params.durationMs ?? null,
    });
  } catch (err) {
    logger.error("auditMcpInvocation failed:", err);
    // Never throw — audit failure must not block inference
  }
}
