import "server-only";

import { desc, eq, sql } from "drizzle-orm";
import { pgDb as db } from "lib/db/pg/db.pg";
import {
  type WorkflowScheduleEntity,
  WorkflowScheduleTable,
} from "lib/db/pg/schema.pg";
import globalLogger from "logger";
import { CronError, computeNextRun, validateCronExpression } from "./cron";
import { extractRows, toDate } from "./pg-rows";

// Agent Platform #22 — workflow schedules (docs/design/agent-platform.md).
// CRUD over workflow_schedule plus the SKIP LOCKED claim the detached worker
// (worker.ts) runs every tick. next_run_at is advanced AT CLAIM TIME, so a
// run that crashes mid-flight never blocks future ticks.

export { CronError, computeNextRun, validateCronExpression } from "./cron";

const logger = globalLogger.withDefaults({
  message: "AgentPlatform Scheduler: ",
});

export type ScheduleRevisionPin = "latest" | "pinned";

export interface CreateScheduleInput {
  workflowId: string;
  cronExpr: string;
  timezone?: string;
  inputTemplate?: unknown;
  teamId?: string | null;
  createdBy: string;
  revisionPin?: ScheduleRevisionPin;
  pinnedRevisionId?: string | null;
}

export interface UpdateSchedulePatch {
  cronExpr?: string;
  timezone?: string;
  inputTemplate?: unknown;
  enabled?: boolean;
  teamId?: string | null;
  revisionPin?: ScheduleRevisionPin;
  pinnedRevisionId?: string | null;
}

/**
 * Validates the cron expression + timezone (throws {@link CronError} when
 * invalid), computes the first nextRunAt and inserts the schedule.
 */
export async function createSchedule(
  input: CreateScheduleInput,
): Promise<WorkflowScheduleEntity> {
  const timezone = input.timezone ?? "UTC";
  // Throws CronError on an invalid expression or timezone.
  const nextRunAt = computeNextRun(input.cronExpr, new Date(), timezone);

  const [schedule] = await db
    .insert(WorkflowScheduleTable)
    .values({
      workflowId: input.workflowId,
      cronExpr: input.cronExpr,
      timezone,
      inputTemplate: input.inputTemplate ?? null,
      teamId: input.teamId ?? null,
      createdBy: input.createdBy,
      revisionPin: input.revisionPin ?? "latest",
      pinnedRevisionId: input.pinnedRevisionId ?? null,
      enabled: true,
      nextRunAt,
    })
    .returning();
  return schedule;
}

/**
 * Patches a schedule. When cronExpr/timezone change — or the schedule is
 * being re-enabled — nextRunAt is recomputed from now (a stale past
 * nextRunAt must not fire immediately on re-enable).
 */
export async function updateSchedule(
  id: string,
  patch: UpdateSchedulePatch,
): Promise<WorkflowScheduleEntity | null> {
  if (patch.cronExpr !== undefined) validateCronExpression(patch.cronExpr);

  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.cronExpr !== undefined) set.cronExpr = patch.cronExpr;
  if (patch.timezone !== undefined) set.timezone = patch.timezone;
  if (patch.inputTemplate !== undefined)
    set.inputTemplate = patch.inputTemplate;
  if (patch.enabled !== undefined) set.enabled = patch.enabled;
  if (patch.teamId !== undefined) set.teamId = patch.teamId;
  if (patch.revisionPin !== undefined) set.revisionPin = patch.revisionPin;
  if (patch.pinnedRevisionId !== undefined)
    set.pinnedRevisionId = patch.pinnedRevisionId;

  const needsRecompute =
    patch.cronExpr !== undefined ||
    patch.timezone !== undefined ||
    patch.enabled === true;

  if (needsRecompute) {
    const [current] = await db
      .select()
      .from(WorkflowScheduleTable)
      .where(eq(WorkflowScheduleTable.id, id))
      .limit(1);
    if (!current) return null;
    const cronExpr = patch.cronExpr ?? current.cronExpr;
    const timezone = patch.timezone ?? current.timezone;
    set.nextRunAt = computeNextRun(cronExpr, new Date(), timezone);
  }

  const [updated] = await db
    .update(WorkflowScheduleTable)
    .set(set)
    .where(eq(WorkflowScheduleTable.id, id))
    .returning();
  return updated ?? null;
}

export async function setScheduleEnabled(
  id: string,
  enabled: boolean,
): Promise<WorkflowScheduleEntity | null> {
  return updateSchedule(id, { enabled });
}

export async function deleteSchedule(id: string): Promise<void> {
  await db
    .delete(WorkflowScheduleTable)
    .where(eq(WorkflowScheduleTable.id, id));
}

export async function listSchedulesForUser(
  createdBy: string,
): Promise<WorkflowScheduleEntity[]> {
  return db
    .select()
    .from(WorkflowScheduleTable)
    .where(eq(WorkflowScheduleTable.createdBy, createdBy))
    .orderBy(desc(WorkflowScheduleTable.createdAt));
}

export async function listSchedulesForTeam(
  teamId: string,
): Promise<WorkflowScheduleEntity[]> {
  return db
    .select()
    .from(WorkflowScheduleTable)
    .where(eq(WorkflowScheduleTable.teamId, teamId))
    .orderBy(desc(WorkflowScheduleTable.createdAt));
}

/**
 * Provisional re-arm applied inside the claiming UPDATE. A claimed row is
 * immediately pushed `now() + 5 minutes` into the future so a concurrent
 * worker can't double-claim it during the tiny window before the precise
 * per-row computeNextRun() update below lands. If this process crashes in
 * that window the schedule fires again in <=5 minutes (an extra run, never a
 * stuck schedule).
 */
const CLAIM_REARM = sql.raw("interval '5 minutes'");

/**
 * Atomically claims up to `limit` due schedules using FOR UPDATE SKIP LOCKED
 * (multiple workers never claim the same row), stamps last_run_at, and
 * advances next_run_at to computeNextRun(now). Advancing at claim time means
 * a crashed run never blocks future ticks.
 */
export async function claimDueSchedules(
  limit: number,
): Promise<WorkflowScheduleEntity[]> {
  if (limit <= 0) return [];

  const result = await db.execute(sql`
    UPDATE ${WorkflowScheduleTable}
       SET last_run_at = now(),
           next_run_at = now() + ${CLAIM_REARM},
           updated_at = now()
     WHERE id IN (
       SELECT id
         FROM ${WorkflowScheduleTable}
        WHERE enabled = true
          AND next_run_at IS NOT NULL
          AND next_run_at <= now()
        ORDER BY next_run_at
          FOR UPDATE SKIP LOCKED
        LIMIT ${limit}
     )
     RETURNING *
  `);

  const claimed = extractRows(result).map(mapScheduleRow);

  // Precise per-row advance — needs the row's own cronExpr/timezone, which
  // SQL can't compute. The provisional re-arm above covers the gap.
  const now = new Date();
  for (const schedule of claimed) {
    try {
      const nextRunAt = computeNextRun(
        schedule.cronExpr,
        now,
        schedule.timezone,
      );
      await db
        .update(WorkflowScheduleTable)
        .set({ nextRunAt, updatedAt: new Date() })
        .where(eq(WorkflowScheduleTable.id, schedule.id));
      schedule.nextRunAt = nextRunAt;
    } catch (error) {
      // Unparseable cron / never-firing expression: disable rather than
      // letting the provisional re-arm spin it every 5 minutes forever.
      logger.error(
        `disabling schedule ${schedule.id} — cannot compute next run:`,
        error,
      );
      await db
        .update(WorkflowScheduleTable)
        .set({ enabled: false, nextRunAt: null, updatedAt: new Date() })
        .where(eq(WorkflowScheduleTable.id, schedule.id));
      schedule.enabled = false;
      schedule.nextRunAt = null;
    }
  }

  return claimed;
}

/** Maps a raw snake_case workflow_schedule row to the drizzle entity shape. */
function mapScheduleRow(row: Record<string, unknown>): WorkflowScheduleEntity {
  return {
    id: row.id,
    workflowId: row.workflow_id,
    revisionPin: row.revision_pin,
    pinnedRevisionId: row.pinned_revision_id ?? null,
    cronExpr: row.cron_expr,
    timezone: row.timezone,
    enabled: row.enabled,
    inputTemplate: row.input_template ?? null,
    teamId: row.team_id ?? null,
    createdBy: row.created_by,
    lastRunAt: toDate(row.last_run_at),
    nextRunAt: toDate(row.next_run_at),
    createdAt: toDate(row.created_at),
    updatedAt: toDate(row.updated_at),
  } as WorkflowScheduleEntity;
}
