import "server-only";

import { and, desc, eq, sql } from "drizzle-orm";
import { pgDb as db } from "lib/db/pg/db.pg";
import { AgentSessionTable, AgentStepTable } from "lib/db/pg/schema.pg";

import { hashContent } from "lib/compliance/audit";
import globalLogger from "logger";

import { resolveRunnableRevision } from "./revisions";
import { recordStep, sumStepCost } from "./sessions";

const logger = globalLogger.withDefaults({
  message: "[conversational-session] ",
});

// Platform-completeness (task #46): a chat turn run WITH a selected agent is a
// first-class governed session, exactly like a workflow run — so it shows in
// the Runs rail and /runs/[id] with a per-turn transcript + cost.
//
// One agent_session of kind 'conversational' per chat thread (reused across
// turns, keyed by threadId). agent_session has no threadId column, so the
// mapping rides on inputPayload->>'threadId' (jsonb). Each user→assistant turn
// becomes one agent_step (nodeKind 'turn', stepIndex = turn number).
//
// EVERY write here is fail-open: a persistence error must NEVER break the chat.
// Callers run these through the fireAndForget pattern (see chat/route.ts).

/** Max stored preview chars for a turn's input/output — bounded, never a raw dump. */
const TURN_PREVIEW_LIMIT = 2000;

/**
 * Bounded, content-safe turn payload. We store a trimmed preview plus a hash
 * and char count rather than the raw message — mirroring how the audit log
 * avoids persisting full prompt/response bodies (lib/compliance/audit.ts).
 */
function turnPayload(text: string): {
  preview: string;
  chars: number;
  truncated: boolean;
  hash: string;
} {
  const trimmed = text.trim();
  return {
    preview: trimmed.slice(0, TURN_PREVIEW_LIMIT),
    chars: trimmed.length,
    truncated: trimmed.length > TURN_PREVIEW_LIMIT,
    hash: hashContent(trimmed),
  };
}

/**
 * Find the existing conversational session for (threadId, agentId, userId), or
 * null. Keyed on inputPayload->>'threadId' so subsequent turns reuse the row.
 */
async function findSessionForThread(
  threadId: string,
  agentId: string,
  userId: string,
): Promise<{ id: string; costSoFar: number } | null> {
  const [row] = await db
    .select({
      id: AgentSessionTable.id,
      costSoFar: AgentSessionTable.costSoFar,
    })
    .from(AgentSessionTable)
    .where(
      and(
        eq(AgentSessionTable.userId, userId),
        eq(AgentSessionTable.kind, "conversational"),
        eq(AgentSessionTable.definitionId, agentId),
        sql`${AgentSessionTable.inputPayload}->>'threadId' = ${threadId}`,
      ),
    )
    .orderBy(desc(AgentSessionTable.createdAt))
    .limit(1);
  return row ?? null;
}

export interface RecordAgentChatTurnInput {
  threadId: string;
  agentId: string;
  agentName?: string | null;
  userId: string;
  teamId?: string | null;
  /** Raw user message text for this turn (trimmed/hashed before storage). */
  userText: string;
  /** Raw assistant response text for this turn (trimmed/hashed before storage). */
  assistantText: string;
  /** This turn's cost in USD — the same figure metered in recordUsage. */
  costUsd: number;
}

/**
 * Governs one agent chat turn: ensures a conversational agent_session for the
 * thread (creating + starting it on the first turn, pinning the agent's
 * published revision if any), appends the turn as an agent_step, and rolls the
 * turn cost into agent_session.cost_so_far.
 *
 * Returns the session id, or null if persistence failed (fail-open). Never
 * throws — the chat must proceed regardless.
 */
export async function recordAgentChatTurn(
  input: RecordAgentChatTurnInput,
): Promise<string | null> {
  try {
    let session = await findSessionForThread(
      input.threadId,
      input.agentId,
      input.userId,
    );

    if (!session) {
      // Pin the agent's published revision when one exists (same contract as
      // workflow runs); fall back to the live definition otherwise.
      const revision = await resolveRunnableRevision(
        "conversational",
        input.agentId,
      ).catch(() => null);

      const now = new Date();
      const [created] = await db
        .insert(AgentSessionTable)
        .values({
          kind: "conversational",
          definitionId: input.agentId,
          revisionId: revision?.id ?? null,
          teamId: input.teamId ?? null,
          userId: input.userId,
          originSurface: "web",
          mode: "interactive",
          // recordAgentChatTurn runs in the chat onFinish — i.e. the turn's
          // generation has ALREADY completed — so a freshly recorded turn is a
          // completed session, not a running one. (Completion is set below;
          // 'queued' is just the column default at insert time.)
          status: "queued",
          startedAt: now,
          heartbeatAt: now,
          inputPayload: {
            threadId: input.threadId,
            agentName: input.agentName ?? null,
          },
        })
        .returning({
          id: AgentSessionTable.id,
          costSoFar: AgentSessionTable.costSoFar,
        });
      session = created;
    }

    if (!session) return null;

    // Turn index = current step count for this session. Steps are unique on
    // (sessionId, stepIndex), so a retried onFinish for the same turn upserts
    // the same row instead of duplicating it.
    const turnIndex = await nextTurnIndex(session.id);

    await recordStep(session.id, {
      nodeId: `turn-${turnIndex}`,
      nodeKind: "turn",
      stepIndex: turnIndex,
      status: "completed",
      input: turnPayload(input.userText),
      output: turnPayload(input.assistantText),
      costUsd: input.costUsd,
    });

    // Roll the running total from the authoritative per-step sum (idempotent on
    // retried turns) and mark the session completed: the turn that just landed
    // is done generating, and the next turn re-stamps endedAt + cost. Leaving
    // it 'completed' keeps the Runs rail (non-terminal only) uncluttered while
    // the full transcript + cost stay visible at /runs/[id].
    const total = await sumStepCost(session.id);
    const now = new Date();
    await db
      .update(AgentSessionTable)
      .set({
        costSoFar: total,
        status: "completed",
        heartbeatAt: now,
        endedAt: now,
        updatedAt: now,
      })
      .where(eq(AgentSessionTable.id, session.id));

    return session.id;
  } catch (error) {
    logger.error("recordAgentChatTurn failed (fail-open):", error);
    return null;
  }
}

/** Next turn step index for a conversational session = current step count. */
async function nextTurnIndex(sessionId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(AgentStepTable)
    .where(eq(AgentStepTable.sessionId, sessionId));
  return Number(row?.count ?? 0);
}
