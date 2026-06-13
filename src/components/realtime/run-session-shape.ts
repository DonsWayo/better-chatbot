/**
 * Shared helpers for subscribing to the `agent_session` Electric shape
 * (whitelisted in src/lib/realtime/shapes.ts; proxied + scoped to
 * WHERE user_id = <caller> by src/app/api/realtime/shape/route.ts).
 *
 * The shape is used purely as a CHANGE SIGNAL, never as the render source: the
 * Runs rail and /runs/[id] page keep their existing server/SWR rendering and
 * just call router.refresh()/SWR mutate when the signal changes. So we only
 * need to map the raw Postgres rows (snake_case columns straight off the
 * shape log) into a tiny fingerprint of the fields that visibly matter.
 *
 * CRITICAL (the regression this whole module exists to avoid): a subscription
 * opens an Electric long-poll (live=true) that NEVER reaches network-idle. The
 * helpers here decide *whether there is anything live to watch*; the callers
 * use that decision to mount the subscriber ONLY when at least one session is
 * non-terminal. With no live run, no subscriber mounts, no connection opens,
 * and Playwright's waitForLoadState('networkidle') resolves normally.
 */

/** Statuses that mean a run is still doing work and worth a live subscription. */
export const NON_TERMINAL_RUN_STATUSES = [
  "queued",
  "running",
  "awaiting_approval",
  "paused",
] as const;

export type RunSessionStatus =
  | (typeof NON_TERMINAL_RUN_STATUSES)[number]
  | "completed"
  | "failed"
  | "cancelled";

/** True while the run is still active (queued/running/awaiting_approval/paused). */
export function isNonTerminalRunStatus(status: string): boolean {
  return (NON_TERMINAL_RUN_STATUSES as readonly string[]).includes(status);
}

/**
 * Raw `agent_session` row as it arrives off the Electric shape log: Postgres
 * column names (snake_case), all values stringified by the shape protocol.
 * The proxy pins no `columns` for this table, so every column is present; we
 * only read the few that drive a visible change.
 */
export type AgentSessionShapeRow = {
  id: string;
  status: string;
  cost_so_far?: string | number | null;
  started_at?: string | null;
  ended_at?: string | null;
  updated_at?: string | null;
};

/**
 * Does any row in the shape represent a still-running session? This is the
 * gate the callers reuse: if false, tear the subscription down (or never mount
 * it). Mirrors the SWR `has-live-run` condition exactly so the two layers
 * agree on when a connection is justified.
 */
export function hasNonTerminalRun(
  rows: readonly { status: string }[] | undefined | null,
): boolean {
  return !!rows?.some((row) => isNonTerminalRunStatus(row.status));
}

/**
 * Order-independent fingerprint of the run set's visible fields. Changes when a
 * run is added/removed, flips status, accrues cost, or starts/ends — exactly
 * the transitions the rail/page re-render for. Stable across reorders so an
 * Electric log reshuffle alone doesn't trigger a spurious refresh.
 */
export function fingerprintRunSessions(
  rows: readonly AgentSessionShapeRow[],
): string {
  return rows
    .map(
      (row) =>
        `${row.id}:${row.status}:${row.cost_so_far ?? ""}:${row.started_at ?? ""}:${row.ended_at ?? ""}:${row.updated_at ?? ""}`,
    )
    .sort()
    .join("|");
}

/**
 * Fingerprint of a single run (the /runs/[id] page watches exactly one row).
 * Returns null when the row is absent from the shape (e.g. not yet replicated)
 * so callers can distinguish "no data" from "unchanged".
 */
export function fingerprintRunSession(
  rows: readonly AgentSessionShapeRow[],
  runId: string,
): string | null {
  const row = rows.find((r) => r.id === runId);
  if (!row) return null;
  return `${row.status}:${row.cost_so_far ?? ""}:${row.started_at ?? ""}:${row.ended_at ?? ""}:${row.updated_at ?? ""}`;
}
