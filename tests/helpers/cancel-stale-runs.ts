import { sql } from "drizzle-orm";
import { pgDb } from "../../src/lib/db/pg/db.pg";

/**
 * Cancel any non-terminal `agent_session` rows left over from prior runs.
 *
 * Why this lives in global setup (and not only in the seed script):
 * the always-present Runs sidebar (`app-sidebar-runs.tsx`) mounts a live
 * Electric `useShape` long-poll on the `agent_session` table whenever the user
 * owns a run in a NON_TERMINAL status (queued/running/awaiting_approval/paused).
 * A live long-poll never lets the page reach `networkidle`, so EVERY spec that
 * does `page.waitForLoadState("networkidle")` on an authenticated shell hangs
 * for the full 60s timeout.
 *
 * `pnpm test:e2e:seed` already cancels these (seed-test-users.ts), but global
 * setup SKIPS the seed when enough users already exist — so a DB carrying stale
 * non-terminal runs (e.g. from manual testing or an interrupted approval spec)
 * would silently break dozens of unrelated specs. Run this unconditionally to
 * keep the shell network-idle-safe regardless of the seed path taken.
 */
export async function cancelStaleRuns(): Promise<void> {
  const result = await pgDb.execute(
    sql`UPDATE agent_session SET status = 'cancelled', ended_at = now() WHERE status IN ('queued', 'running', 'awaiting_approval', 'paused')`,
  );
  const count = (result as { rowCount?: number }).rowCount ?? 0;
  if (count > 0) {
    console.log(`🧹 Cancelled ${count} stale non-terminal run(s)`);
  }
}
