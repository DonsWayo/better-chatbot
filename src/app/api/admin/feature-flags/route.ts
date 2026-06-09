import { NextResponse } from "next/server";
import { getSession } from "lib/auth/server";
import { pgDb } from "lib/db/pg/db.pg";
import { AsafeFeatureFlagTable } from "lib/db/pg/schema.pg";

import { z } from "zod";
import { _resetKillSwitchCache } from "lib/observability/kill-switch";

const UpdateFlagSchema = z.object({
  name: z.string().min(1).max(100),
  enabled: z.boolean(),
});

/**
 * GET /api/admin/feature-flags
 * List all feature flags. Admin-only.
 */
export async function GET(_request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "admin")
    return NextResponse.json({ error: "Admin required" }, { status: 403 });

  const flags = await pgDb
    .select()
    .from(AsafeFeatureFlagTable)
    .orderBy(AsafeFeatureFlagTable.name);

  return NextResponse.json({ flags });
}

/**
 * POST /api/admin/feature-flags
 * Create or update a feature flag. Admin-only.
 * Body: { name: string, enabled: boolean }
 */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "admin")
    return NextResponse.json({ error: "Admin required" }, { status: 403 });

  const body = await request.json().catch(() => null);
  const parsed = UpdateFlagSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 400 });

  const { name, enabled } = parsed.data;

  await pgDb
    .insert(AsafeFeatureFlagTable)
    .values({ name, enabled, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: AsafeFeatureFlagTable.name,
      set: { enabled, updatedAt: new Date() },
    });

  // Flush the in-process cache so the new value is visible immediately in this pod
  if (name === "kill_switch") {
    _resetKillSwitchCache();
  }

  return NextResponse.json({ name, enabled });
}
