import "server-only";

import { colorize } from "consola/utils";
import { eq, sql } from "drizzle-orm";
import { createWorkflowExecutor } from "lib/ai/workflow/executor/workflow-executor";
import { pgDb as db } from "lib/db/pg/db.pg";
import {
  type AgentSessionEntity,
  AgentSessionTable,
} from "lib/db/pg/schema.pg";
import { workflowRepository } from "lib/db/repository";
import { isKillSwitchActive } from "lib/observability/kill-switch";
import { toAny } from "lib/utils";
import globalLogger from "logger";
import { isApprovalPending } from "./approval-error";
import { markSessionAwaitingApproval } from "./approvals";
import {
  type SubscribableExecutor,
  attachSessionPersistence,
} from "./persistent-executor";
import { extractRows, toDate } from "./pg-rows";
import { claimDueSchedules } from "./scheduler";
import { createSession, failSession, getSessionWithSteps } from "./sessions";

// Agent Platform #22 — the detached run executor
// (docs/design/agent-platform.md). Claims due workflow_schedule rows into
// queued agent_session rows, then claims queued sessions with FOR UPDATE
// SKIP LOCKED and executes them out-of-band. Sessions whose worker died
// (stale heartbeat) are reclaimed by the same query.

const logger = globalLogger.withDefaults({ message: "AgentPlatform Worker: " });

/**
 * A running session whose heartbeat is older than this is considered
 * orphaned (its worker died) and may be reclaimed by another worker.
 * persistent-executor touches the heartbeat on every NODE event.
 */
const HEARTBEAT_STALE_SECONDS = 90;
const DEFAULT_SCHEDULE_CLAIM_LIMIT = 10;
/** Max detached sessions executed per tick (N=3). */
const DEFAULT_MAX_SESSIONS_PER_TICK = 3;
/** Mirrors the synchronous execute route's per-run timeout. */
const RUN_TIMEOUT_MS = 5 * 60 * 1000;
const DEFAULT_TICK_INTERVAL_MS = 5_000;

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof (error as { message?: unknown }).message === "string"
  ) {
    return (error as { message: string }).message;
  }
  return String(error ?? "Unknown error");
}

/**
 * Claims one runnable workflow session with FOR UPDATE SKIP LOCKED:
 * either a queued session, or a "running" session whose heartbeat went
 * stale (its worker crashed) — the reclaim path. The claim itself flips the
 * row to running and stamps the heartbeat, so no other worker can take it.
 */
export async function claimQueuedSession(): Promise<AgentSessionEntity | null> {
  const result = await db.execute(sql`
    UPDATE ${AgentSessionTable}
       SET status = 'running',
           heartbeat_at = now(),
           started_at = COALESCE(started_at, now()),
           updated_at = now()
     WHERE id IN (
       SELECT id
         FROM ${AgentSessionTable}
        WHERE kind = 'workflow'
          AND (
            status = 'queued'
            OR (
              status = 'running'
              AND heartbeat_at IS NOT NULL
              AND heartbeat_at < now() - make_interval(secs => ${HEARTBEAT_STALE_SECONDS})
            )
          )
        ORDER BY created_at
          FOR UPDATE SKIP LOCKED
        LIMIT 1
     )
     RETURNING *
  `);

  const rows = extractRows(result);
  if (rows.length === 0) return null;
  return mapSessionRow(rows[0]);
}

/** Kill-switch path: hand the claimed session back to the queue untouched. */
async function requeueSession(id: string): Promise<void> {
  await db
    .update(AgentSessionTable)
    .set({ status: "queued", updatedAt: new Date() })
    .where(eq(AgentSessionTable.id, id));
}

export type RunOutcome =
  | "completed"
  | "failed"
  | "requeued"
  | "awaiting_approval";

/**
 * Executes one claimed workflow session: loads the workflow structure (same
 * repository call the synchronous execute route uses), wires
 * attachSessionPersistence so steps/heartbeats checkpoint into
 * agent_session/agent_step, and runs to completion.
 *
 * The org-wide kill switch is honored BEFORE starting: when active the
 * session is re-queued (not run, not failed) and picked up after the switch
 * clears.
 */
export async function runClaimedSession(
  session: AgentSessionEntity,
): Promise<RunOutcome> {
  if (await isKillSwitchActive()) {
    logger.warn(`kill switch active — re-queueing session ${session.id}`);
    await requeueSession(session.id);
    return "requeued";
  }

  // Defense in depth (ADR-0009): re-verify the session owner can still access
  // this workflow at execution time, even though createScheduleAction gated it
  // at schedule time — grants/visibility may have been revoked since. A
  // sessionless or inaccessible run is failed, never executed.
  if (session.userId) {
    const stillHasAccess = await workflowRepository
      .checkAccess(session.definitionId, session.userId, true)
      .catch(() => false);
    if (!stillHasAccess) {
      await failSession(
        session.id,
        `User ${session.userId} no longer has access to workflow ${session.definitionId}`,
      );
      return "failed";
    }
  }

  const workflow = await workflowRepository.selectStructureById(
    session.definitionId,
  );
  if (!workflow) {
    await failSession(session.id, `Workflow ${session.definitionId} not found`);
    return "failed";
  }

  // W7 guardrails (ADR-0008): detached runs scan LLM-node prompts with the
  // session owner's team posture; failures fall back to the org default.
  // W3/ADR-0009: resolve the owner's team + effective model allow-list so
  // LLM/tool nodes are budget-attributed and model-confined out-of-band.
  let guardrailPolicy: string | undefined;
  let teamId: string | null = session.teamId ?? null;
  let effectiveModelAllowList: string[] | null = null;
  if (session.userId) {
    try {
      const { getTeamPolicy, getUserPrimaryTeamId } = await import(
        "lib/admin/teams"
      );
      teamId = teamId ?? (await getUserPrimaryTeamId(session.userId));
      if (teamId)
        guardrailPolicy = (await getTeamPolicy(teamId)).guardrailPolicy;
    } catch {
      // org default applies
    }
    try {
      const { resolveEffectiveModelAllowList } = await import(
        "lib/admin/effective-models"
      );
      effectiveModelAllowList = await resolveEffectiveModelAllowList(
        session.userId,
        teamId,
      );
    } catch {
      // unrestricted on resolver failure (fail open, matching the chat seam)
    }
  }

  // W3 (ADR-0003): enforce the owner's team budget before a scheduled run.
  // A budget-exhausted routine is failed (not silently billed to nothing).
  if (session.userId) {
    const { checkBudget } = await import("lib/ai/budget");
    const budgetCheck = await checkBudget(session.userId, teamId);
    if (!budgetCheck.allowed) {
      await failSession(
        session.id,
        budgetCheck.reason ?? "Team budget exhausted",
      );
      return "failed";
    }
  }

  // #24 resume: an approved session re-queued after parking already has
  // completed agent_step rows. Seed their outputs so the executor SKIPS those
  // nodes instead of re-running the whole graph from an empty state (which
  // burns duplicate LLM cost + repeats side effects). A fresh run seeds {}.
  const initialOutputs = await loadCompletedStepOutputs(session.id);
  if (Object.keys(initialOutputs).length > 0) {
    logger.info(
      `resuming session ${session.id} with ${Object.keys(initialOutputs).length} already-completed node(s) seeded`,
    );
  }

  const executor = createWorkflowExecutor({
    nodes: workflow.nodes,
    edges: workflow.edges,
    logger: globalLogger.withDefaults({
      message: colorize("cyan", `WORKFLOW(detached) '${workflow.name}' `),
    }),
    // #4: detached/scheduled runs must carry the governing session id, else
    // Approval nodes throw "Approval node requires a governed agent session".
    agentSessionId: session.id,
    userId: session.userId ?? undefined,
    guardrailPolicy,
    teamId,
    effectiveModelAllowList,
    initialOutputs,
  });
  const persistence = attachSessionPersistence(
    executor as unknown as SubscribableExecutor,
    session.id,
  );

  try {
    const input = session.inputPayload ?? {};
    const result = await executor.run(toAny(input), {
      disableHistory: true,
      timeout: RUN_TIMEOUT_MS,
    });
    if (!result.isOk) {
      // #5: an ApprovalPendingError is a PAUSE, not a failure. The approvals
      // lib already flipped the session to awaiting_approval; re-assert it
      // (the generic WORKFLOW_END path may have raced) and do NOT failSession,
      // exactly like the synchronous execute route.
      if (isApprovalPending(result.error)) {
        await markSessionAwaitingApproval(session.id).catch((err) => {
          logger.error(
            `markSessionAwaitingApproval(${session.id}) failed:`,
            err,
          );
        });
        logger.info(`session ${session.id} parked awaiting approval`);
        return "awaiting_approval";
      }
      // persistent-executor's WORKFLOW_END handler also fails the session,
      // but fire-and-forget — this await makes the terminal state durable.
      await failSession(session.id, errorMessage(result.error));
      return "failed";
    }
    return "completed";
  } catch (error) {
    // A thrown ApprovalPendingError is also a pause, not a failure.
    if (isApprovalPending(error)) {
      await markSessionAwaitingApproval(session.id).catch(() => {});
      logger.info(`session ${session.id} parked awaiting approval`);
      return "awaiting_approval";
    }
    await failSession(session.id, errorMessage(error));
    return "failed";
  } finally {
    // Drain all fire-and-forget step/session writes BEFORE detaching — the
    // detached worker exits right after this returns, so without the flush the
    // per-node agent_step rows race the process teardown and are lost.
    await persistence.flush().catch((err) => {
      logger.error(`persistence flush(${session.id}) failed:`, err);
    });
    persistence();
  }
}

/**
 * #24 resume seed — map of nodeId → output for every already-'completed' step
 * of a session. Used to skip re-execution of prior nodes on an approval
 * resume. Empty for a first run (no completed steps yet). Best-effort: any
 * load failure yields {} (full re-run, the prior behavior).
 */
async function loadCompletedStepOutputs(
  sessionId: string,
): Promise<{ [nodeId: string]: unknown }> {
  try {
    const withSteps = await getSessionWithSteps(sessionId);
    if (!withSteps) return {};
    const seed: { [nodeId: string]: unknown } = {};
    for (const step of withSteps.steps) {
      // A node that produced an output already ran to completion — seed it so
      // the resume skips it. We key on output presence (not just
      // status='completed') so a node whose terminal write raced an approval
      // abort is still treated as done and not re-executed.
      if (step.output != null && step.nodeKind !== "approval") {
        seed[step.nodeId] = step.output;
      }
    }
    return seed;
  } catch (error) {
    logger.error(
      `loadCompletedStepOutputs(${sessionId}) failed; full re-run:`,
      error,
    );
    return {};
  }
}

export interface TickResult {
  /** Due schedules materialized into queued sessions this tick. */
  scheduled: number;
  /** Sessions run to successful completion this tick. */
  executed: number;
  /** Sessions or schedule materializations that failed this tick. */
  failed: number;
}

export interface TickOptions {
  maxSessions?: number;
  scheduleClaimLimit?: number;
}

/**
 * One worker tick:
 *  1. claim due schedules → create queued agent_session rows
 *     (originSurface "schedule", mode "autopilot", input from the template);
 *  2. claim + run up to N queued/stale sessions.
 *
 * Returns counts for observability (logged by the loop / returned by the
 * /api/hooks/agent-tick ingress).
 */
export async function tickOnce(opts?: TickOptions): Promise<TickResult> {
  const counts: TickResult = { scheduled: 0, executed: 0, failed: 0 };

  let due: Awaited<ReturnType<typeof claimDueSchedules>> = [];
  try {
    due = await claimDueSchedules(
      opts?.scheduleClaimLimit ?? DEFAULT_SCHEDULE_CLAIM_LIMIT,
    );
  } catch (error) {
    logger.error("claimDueSchedules failed:", error);
  }

  for (const schedule of due) {
    try {
      await createSession({
        kind: "workflow",
        definitionId: schedule.workflowId,
        revisionId:
          schedule.revisionPin === "pinned" ? schedule.pinnedRevisionId : null,
        teamId: schedule.teamId,
        userId: schedule.createdBy,
        originSurface: "schedule",
        mode: "autopilot",
        inputPayload: schedule.inputTemplate ?? null,
      });
      counts.scheduled++;
    } catch (error) {
      counts.failed++;
      logger.error(
        `failed to create session for schedule ${schedule.id}:`,
        error,
      );
    }
  }

  const maxSessions = opts?.maxSessions ?? DEFAULT_MAX_SESSIONS_PER_TICK;
  for (let i = 0; i < maxSessions; i++) {
    let session: AgentSessionEntity | null = null;
    try {
      session = await claimQueuedSession();
    } catch (error) {
      logger.error("claimQueuedSession failed:", error);
      break;
    }
    if (!session) break;

    try {
      const outcome = await runClaimedSession(session);
      if (outcome === "completed") counts.executed++;
      else if (outcome === "failed") counts.failed++;
      // awaiting_approval parked the run cleanly — not failed, not executed;
      // keep claiming further sessions this tick.
      else if (outcome === "awaiting_approval") continue;
      // Kill switch re-queued the session — stop claiming this tick or we
      // would claim/re-queue the same row in a tight loop.
      else break;
    } catch (error) {
      counts.failed++;
      logger.error(`session ${session.id} crashed:`, error);
      await failSession(session.id, errorMessage(error)).catch((err) => {
        logger.error(`failSession(${session?.id}) failed:`, err);
      });
    }
  }

  return counts;
}

export interface WorkerLoopOptions {
  intervalMs?: number;
  /** Injectable tick (tests); defaults to {@link tickOnce}. */
  tick?: () => Promise<TickResult>;
  onTick?: (result: TickResult) => void;
}

export interface WorkerLoopHandle {
  /** Stops the loop; resolves once any in-flight tick has finished. */
  stop: () => Promise<void>;
}

/**
 * setInterval-based worker loop with an overlap guard: when a tick is still
 * running at the next interval boundary, that interval is skipped (ticks
 * never run concurrently within one process).
 */
export function startWorkerLoop(opts?: WorkerLoopOptions): WorkerLoopHandle {
  const intervalMs = opts?.intervalMs ?? DEFAULT_TICK_INTERVAL_MS;
  const tick = opts?.tick ?? tickOnce;

  let stopped = false;
  let inFlight: Promise<void> | null = null;

  const timer = setInterval(() => {
    if (stopped || inFlight) return; // overlap guard
    inFlight = tick()
      .then((result) => {
        opts?.onTick?.(result);
      })
      .catch((error) => {
        logger.error("tick failed:", error);
      })
      .finally(() => {
        inFlight = null;
      });
  }, intervalMs);

  return {
    async stop() {
      stopped = true;
      clearInterval(timer);
      if (inFlight) await inFlight;
    },
  };
}

/** Maps a raw snake_case agent_session row to the drizzle entity shape. */
function mapSessionRow(row: Record<string, unknown>): AgentSessionEntity {
  return {
    id: row.id,
    kind: row.kind,
    definitionId: row.definition_id,
    revisionId: row.revision_id ?? null,
    teamId: row.team_id ?? null,
    userId: row.user_id,
    folderId: row.folder_id ?? null,
    originSurface: row.origin_surface,
    mode: row.mode,
    status: row.status,
    costSoFar: row.cost_so_far ?? 0,
    inputPayload: row.input_payload ?? null,
    error: row.error ?? null,
    parentSessionId: row.parent_session_id ?? null,
    heartbeatAt: toDate(row.heartbeat_at),
    startedAt: toDate(row.started_at),
    endedAt: toDate(row.ended_at),
    createdAt: toDate(row.created_at),
    updatedAt: toDate(row.updated_at),
  } as AgentSessionEntity;
}
