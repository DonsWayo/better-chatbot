"use server";

import { type ActionResult, toActionResult } from "app-types/util";
import { getSession } from "auth/server";
import { getTeamWithMembers, getUserPrimaryTeamId } from "lib/admin/teams";
import {
  createSchedule,
  deleteSchedule,
  listSchedulesForUser,
  setScheduleEnabled,
} from "lib/agent-platform/scheduler";
import { estimateCostUsd } from "lib/ai/budget";
import type { WorkflowScheduleEntity } from "lib/db/pg/schema.pg";
import { workflowRepository } from "lib/db/repository";

// Agent Platform #22/#26 — routine (workflow_schedule) mutations from the
// /schedule dialog and the Triage "Routines" tab. Internal-UI mutations →
// Server Actions only (docs/CLAUDE.md rule); logic lives in
// lib/agent-platform/scheduler.ts (read-only import).

export interface CreateScheduleActionInput {
  workflowId: string;
  cronExpr: string;
  /** IANA zone; the schedule dialog defaults to Europe/London. */
  timezone?: string;
  /** Created enabled by default; false parks the routine immediately. */
  enabled?: boolean;
}

async function requireUserId(): Promise<string> {
  const session = await getSession();
  if (!session?.user?.id) throw new Error("Unauthorized");
  return session.user.id;
}

/**
 * Ownership gate for toggle/delete: scheduler.ts has no get-by-id, so we
 * resolve the schedule through the caller's own list — a foreign id simply
 * isn't found, which doubles as the permission check.
 */
async function requireOwnSchedule(
  userId: string,
  id: string,
): Promise<WorkflowScheduleEntity> {
  const own = await listSchedulesForUser(userId);
  const schedule = own.find((s) => s.id === id);
  if (!schedule) throw new Error("Schedule not found");
  return schedule;
}

async function createScheduleOrThrow(
  input: CreateScheduleActionInput,
): Promise<WorkflowScheduleEntity> {
  const userId = await requireUserId();

  // ADR-0009 IDOR fix: a schedule runs this workflow nightly as `userId`, so
  // the caller must be able to access it. Without this, any user could
  // schedule (and thus execute, via the worker) an admin-authored workflow.
  const hasAccess = await workflowRepository.checkAccess(
    input.workflowId,
    userId,
    true,
  );
  if (!hasAccess) {
    throw new Error("You do not have access to this workflow");
  }

  const teamId = await getUserPrimaryTeamId(userId);

  // Throws CronError on an invalid expression/timezone — the dialog
  // surfaces that message inline as its client-side validation.
  const schedule = await createSchedule({
    workflowId: input.workflowId,
    cronExpr: input.cronExpr,
    timezone: input.timezone ?? "Europe/London",
    teamId,
    createdBy: userId,
  });

  if (input.enabled === false) {
    const disabled = await setScheduleEnabled(schedule.id, false);
    return disabled ?? schedule;
  }
  return schedule;
}

/**
 * Returns a structured {@link ActionResult} rather than throwing: the CronError
 * reason for an invalid custom cron is meant to be shown INLINE in the dialog
 * so the user can fix it. In production Next.js masks a thrown error into an
 * opaque 500 ("digest"), so the precise message would otherwise be lost.
 */
export async function createScheduleAction(
  input: CreateScheduleActionInput,
): Promise<ActionResult<WorkflowScheduleEntity>> {
  return toActionResult(() => createScheduleOrThrow(input));
}

async function toggleScheduleOrThrow(
  id: string,
  enabled: boolean,
): Promise<WorkflowScheduleEntity | null> {
  const userId = await requireUserId();
  await requireOwnSchedule(userId, id);
  return setScheduleEnabled(id, enabled);
}

export async function toggleScheduleAction(
  id: string,
  enabled: boolean,
): Promise<ActionResult<WorkflowScheduleEntity | null>> {
  return toActionResult(() => toggleScheduleOrThrow(id, enabled));
}

async function deleteScheduleOrThrow(id: string): Promise<void> {
  const userId = await requireUserId();
  await requireOwnSchedule(userId, id);
  await deleteSchedule(id);
}

export async function deleteScheduleAction(id: string): Promise<ActionResult> {
  return toActionResult(() => deleteScheduleOrThrow(id));
}

export interface RoutineCostEstimate {
  estimatedUsd: number;
  /** Team name when the caller has a primary team, else "personal". */
  budgetLabel: string | null;
}

/** Nominal per-run estimate for the cost preview: a ~2k-token run. */
const NOMINAL_PROMPT_TOKENS = 1500;
const NOMINAL_COMPLETION_TOKENS = 500;

/**
 * Static cost preview for the schedule dialog: prices a nominal 2k-token run
 * with the default model pricing and resolves which budget pays for it.
 * budgetLabel is null when the user has no primary team (the pill then shows
 * the localized "personal" label).
 */
export async function estimateRoutineCostAction(): Promise<RoutineCostEstimate> {
  const userId = await requireUserId();

  const estimatedUsd = estimateCostUsd(
    "default",
    NOMINAL_PROMPT_TOKENS,
    NOMINAL_COMPLETION_TOKENS,
  );

  const teamId = await getUserPrimaryTeamId(userId);
  if (!teamId) return { estimatedUsd, budgetLabel: null };

  try {
    const team = await getTeamWithMembers(teamId);
    return { estimatedUsd, budgetLabel: team?.name ?? null };
  } catch {
    return { estimatedUsd, budgetLabel: null };
  }
}
