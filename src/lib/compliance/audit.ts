/**
 * W8 Compliance Audit Logger
 *
 * append-only; fire-and-forget; never throws.
 * Default retention: 6 months (enforced by a scheduled job, not here).
 */

import { pgDb as db } from "@/lib/db/pg/db.pg";
import { AsafeAuditLogTable } from "@/lib/db/pg/schema.pg";
import globalLogger from "logger";

const logger = globalLogger.withDefaults({ message: "audit: " });

export type AuditEventType =
  | "chat_request"
  | "rag_retrieval"
  | "tool_call"
  | "guardrail_firing"
  | "admin_action"
  | "user_erasure"
  | "aup_accepted"
  | "gateway_completion";

export type AuditActorType = "human" | "agent";

export interface AuditEvent {
  userId: string;
  teamId?: string | null;
  eventType: AuditEventType;
  details?: Record<string, unknown>;
  /** Who performed the action — defaults to "human" (B90 #23). */
  actorType?: AuditActorType;
  /** Agent session that performed the action, when actorType is "agent". */
  agentSessionId?: string | null;
}

export async function writeAuditLog(event: AuditEvent): Promise<void> {
  try {
    await db.insert(AsafeAuditLogTable).values({
      userId: event.userId,
      teamId: event.teamId ?? null,
      actorType: event.actorType ?? "human",
      agentSessionId: event.agentSessionId ?? null,
      eventType: event.eventType,
      details: event.details ? JSON.stringify(event.details) : "{}",
    });
  } catch (err) {
    logger.error("audit write failed (non-fatal):", err);
  }
}

/** Convenience: log a chat request lifecycle (no raw prompt — content hash only). */
export function auditChatRequest(params: {
  userId: string;
  teamId?: string | null;
  model: string;
  promptHash: string;
  guardrailFired: boolean;
  ragUsed: boolean;
}): void {
  void writeAuditLog({
    userId: params.userId,
    teamId: params.teamId,
    eventType: "chat_request",
    details: {
      model: params.model,
      promptHash: params.promptHash,
      guardrailFired: params.guardrailFired,
      ragUsed: params.ragUsed,
    },
  });
}

/** Quick hash for audit (not cryptographic — just for dedup/correlation) */
export function hashContent(text: string): string {
  let hash = 0;
  for (let i = 0; i < Math.min(text.length, 2000); i++) {
    hash = (Math.imul(31, hash) + text.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(16);
}
