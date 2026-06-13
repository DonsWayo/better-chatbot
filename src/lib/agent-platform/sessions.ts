import "server-only";

import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { pgDb as db } from "lib/db/pg/db.pg";
import {
  type AgentSessionEntity,
  AgentSessionTable,
  type AgentStepEntity,
  AgentStepTable,
} from "lib/db/pg/schema.pg";

// Agent Platform #21 — session/step persistence spine
// (docs/design/agent-platform.md). Every governed execution — workflow run,
// conversational agent thread, opencode desktop session — is an agent_session
// with checkpointed agent_step rows keyed on (sessionId, stepIndex).

export type AgentSessionKind = "workflow" | "conversational" | "opencode";
export type AgentSessionOriginSurface =
  | "web"
  | "desktop"
  | "schedule"
  | "webhook"
  | "api";
export type AgentSessionMode = "interactive" | "plan" | "autopilot";
export type AgentSessionStatus =
  | "queued"
  | "running"
  | "awaiting_approval"
  | "paused"
  | "completed"
  | "failed"
  | "cancelled";
export type AgentStepStatus = "running" | "completed" | "failed" | "skipped";

/** Session statuses that still occupy (or may re-occupy) a worker. */
const ACTIVE_STATUSES: AgentSessionStatus[] = [
  "queued",
  "running",
  "awaiting_approval",
  "paused",
];

export interface CreateSessionInput {
  kind: AgentSessionKind;
  /** Polymorphic pointer into the agent/workflow tables (no FK). */
  definitionId: string;
  /** Pinned immutable revision — nullable until the revisions table lands. */
  revisionId?: string | null;
  teamId?: string | null;
  userId: string;
  folderId?: string | null;
  originSurface?: AgentSessionOriginSurface;
  mode?: AgentSessionMode;
  inputPayload?: unknown;
  parentSessionId?: string | null;
}

export interface RecordStepInput {
  nodeId: string;
  nodeKind?: string | null;
  stepIndex: number;
  status: AgentStepStatus;
  input?: unknown;
  output?: unknown;
  error?: string | null;
  costUsd?: number;
}

export async function createSession(
  input: CreateSessionInput,
): Promise<AgentSessionEntity> {
  const [session] = await db
    .insert(AgentSessionTable)
    .values({
      kind: input.kind,
      definitionId: input.definitionId,
      revisionId: input.revisionId ?? null,
      teamId: input.teamId ?? null,
      userId: input.userId,
      folderId: input.folderId ?? null,
      originSurface: input.originSurface ?? "web",
      mode: input.mode ?? "interactive",
      status: "queued",
      inputPayload: input.inputPayload ?? null,
      parentSessionId: input.parentSessionId ?? null,
    })
    .returning();
  return session;
}

export async function startSession(
  id: string,
): Promise<AgentSessionEntity | null> {
  const now = new Date();
  const [updated] = await db
    .update(AgentSessionTable)
    .set({
      status: "running",
      startedAt: now,
      heartbeatAt: now,
      updatedAt: now,
    })
    .where(eq(AgentSessionTable.id, id))
    .returning();
  return updated ?? null;
}

export async function completeSession(
  id: string,
  opts?: { costSoFar?: number },
): Promise<AgentSessionEntity | null> {
  const now = new Date();
  const [updated] = await db
    .update(AgentSessionTable)
    .set({
      status: "completed",
      endedAt: now,
      updatedAt: now,
      ...(opts?.costSoFar !== undefined ? { costSoFar: opts.costSoFar } : {}),
    })
    .where(eq(AgentSessionTable.id, id))
    .returning();
  return updated ?? null;
}

export async function failSession(
  id: string,
  error: string,
): Promise<AgentSessionEntity | null> {
  const now = new Date();
  const [updated] = await db
    .update(AgentSessionTable)
    .set({ status: "failed", error, endedAt: now, updatedAt: now })
    .where(eq(AgentSessionTable.id, id))
    .returning();
  return updated ?? null;
}

export async function cancelSession(
  id: string,
): Promise<AgentSessionEntity | null> {
  const now = new Date();
  const [updated] = await db
    .update(AgentSessionTable)
    .set({ status: "cancelled", endedAt: now, updatedAt: now })
    .where(eq(AgentSessionTable.id, id))
    .returning();
  return updated ?? null;
}

/** Worker-liveness ping; stale heartbeats let another worker reclaim a run. */
export async function touchHeartbeat(id: string): Promise<void> {
  const now = new Date();
  await db
    .update(AgentSessionTable)
    .set({ heartbeatAt: now, updatedAt: now })
    .where(eq(AgentSessionTable.id, id));
}

/**
 * Upsert one checkpoint on (sessionId, stepIndex): NODE_START inserts the row
 * as `running`; NODE_END hits the unique pair and flips it to
 * completed/failed with output/error. `endedAt` is stamped on any terminal
 * status and left null while running.
 */
export async function recordStep(
  sessionId: string,
  step: RecordStepInput,
): Promise<AgentStepEntity> {
  const terminal = step.status !== "running";
  const endedAt = terminal ? new Date() : null;
  const updateSet: Record<string, unknown> = {
    status: step.status,
    endedAt,
  };
  // Only overwrite optional fields the caller actually provided, so a
  // NODE_END upsert never wipes the input captured at NODE_START.
  if (step.nodeKind !== undefined) updateSet.nodeKind = step.nodeKind;
  if (step.input !== undefined) updateSet.input = step.input;
  if (step.output !== undefined) updateSet.output = step.output;
  if (step.error !== undefined) updateSet.error = step.error;
  if (step.costUsd !== undefined) updateSet.costUsd = step.costUsd;

  const [row] = await db
    .insert(AgentStepTable)
    .values({
      sessionId,
      nodeId: step.nodeId,
      nodeKind: step.nodeKind ?? null,
      stepIndex: step.stepIndex,
      status: step.status,
      input: step.input ?? null,
      output: step.output ?? null,
      error: step.error ?? null,
      costUsd: step.costUsd ?? 0,
      endedAt,
    })
    .onConflictDoUpdate({
      target: [AgentStepTable.sessionId, AgentStepTable.stepIndex],
      set: updateSet,
    })
    .returning();
  return row;
}

/**
 * #2 — sweep any still-'running' steps of a session to 'completed' (stamping
 * endedAt). The output node's NODE_END can race WORKFLOW_END, leaving the
 * final step stuck 'running'; on a successful workflow end we mark them done.
 * Returns the number of rows flipped.
 */
export async function completeRunningSteps(sessionId: string): Promise<number> {
  const now = new Date();
  const rows = await db
    .update(AgentStepTable)
    .set({ status: "completed", endedAt: now })
    .where(
      and(
        eq(AgentStepTable.sessionId, sessionId),
        eq(AgentStepTable.status, "running"),
      ),
    )
    .returning({ id: AgentStepTable.id });
  return rows.length;
}

/**
 * #3 — SUM(agent_step.cost_usd) for a session, rolled into
 * agent_session.cost_so_far at WORKFLOW_END. Returns 0 when no steps cost
 * anything (or none exist yet).
 */
export async function sumStepCost(sessionId: string): Promise<number> {
  const [row] = await db
    .select({
      total: sql<number>`COALESCE(SUM(${AgentStepTable.costUsd}), 0)`,
    })
    .from(AgentStepTable)
    .where(eq(AgentStepTable.sessionId, sessionId));
  return Number(row?.total ?? 0);
}

export async function listSessionsForUser(
  userId: string,
  opts?: { limit?: number },
): Promise<AgentSessionEntity[]> {
  return db
    .select()
    .from(AgentSessionTable)
    .where(eq(AgentSessionTable.userId, userId))
    .orderBy(desc(AgentSessionTable.createdAt))
    .limit(opts?.limit ?? 50);
}

export async function listActiveSessionsForTeam(
  teamId: string,
): Promise<AgentSessionEntity[]> {
  return db
    .select()
    .from(AgentSessionTable)
    .where(
      and(
        eq(AgentSessionTable.teamId, teamId),
        inArray(AgentSessionTable.status, ACTIVE_STATUSES),
      ),
    )
    .orderBy(desc(AgentSessionTable.createdAt));
}

export async function getSessionWithSteps(
  id: string,
): Promise<{ session: AgentSessionEntity; steps: AgentStepEntity[] } | null> {
  const [session] = await db
    .select()
    .from(AgentSessionTable)
    .where(eq(AgentSessionTable.id, id))
    .limit(1);
  if (!session) return null;
  const steps = await db
    .select()
    .from(AgentStepTable)
    .where(eq(AgentStepTable.sessionId, id))
    .orderBy(asc(AgentStepTable.stepIndex));
  return { session, steps };
}
