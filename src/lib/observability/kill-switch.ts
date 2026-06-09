"server-only";

/**
 * W12 — kill switch.
 *
 * When ASAFE_KILL_SWITCH=1 (env var) or the DB flag is set, all chat
 * requests are rejected with 503. Designed as a fast operator control
 * during incidents — no code deploy required.
 *
 * Env override: ASAFE_KILL_SWITCH=1 → immediate, no DB round-trip.
 * DB flag: asafe_feature_flag table row {name: "kill_switch", enabled: true}.
 *
 * The kill switch is checked per-request and is cached for 5s to avoid
 * a DB round-trip on every request.
 */

import { pgDb } from "@/lib/db/pg/db.pg";
import { AsafeFeatureFlagTable } from "@/lib/db/pg/schema.pg";
import { eq } from "drizzle-orm";
import { killSwitchActivations } from "./slo";

const ENV_KILL_SWITCH = process.env.ASAFE_KILL_SWITCH === "1";

// 5-second in-process cache — avoids per-request DB round-trips
let _cached: boolean | null = null;
let _cachedAt = 0;
const CACHE_TTL = 5_000;

async function readDbFlag(): Promise<boolean> {
  try {
    const [row] = await pgDb
      .select({ enabled: AsafeFeatureFlagTable.enabled })
      .from(AsafeFeatureFlagTable)
      .where(eq(AsafeFeatureFlagTable.name, "kill_switch"))
      .limit(1);
    return row?.enabled === true;
  } catch {
    // Fail open on DB error — never block inference because we can't read the flag
    return false;
  }
}

/** Returns true if the kill switch is active and requests should be blocked. */
export async function isKillSwitchActive(): Promise<boolean> {
  if (ENV_KILL_SWITCH) return true;

  const now = Date.now();
  if (_cached !== null && now - _cachedAt < CACHE_TTL) return _cached;

  _cached = await readDbFlag();
  _cachedAt = now;
  return _cached;
}

/** Returns a 503 Response if the kill switch is active; null otherwise. */
export async function checkKillSwitch(
  teamId?: string | null,
): Promise<Response | null> {
  if (!(await isKillSwitchActive())) return null;

  killSwitchActivations.inc();

  const message =
    "The AI assistant is temporarily unavailable for maintenance. Please try again later.";

  return Response.json({ message }, { status: 503 });
}

/** Manually reset the in-process cache (useful in tests). */
export function _resetKillSwitchCache(): void {
  _cached = null;
  _cachedAt = 0;
}
