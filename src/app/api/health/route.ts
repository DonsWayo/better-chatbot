import { sql } from "drizzle-orm";
import { pgDb } from "lib/db/pg/db.pg";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VERSION = process.env.APP_VERSION ?? "dev";

/**
 * Health endpoint (ADR-0006).
 * - default: liveness — process is up.
 * - `?ready`: readiness — also verifies DB connectivity (for the k8s readinessProbe).
 */
export async function GET(request: Request) {
  const wantsReady = new URL(request.url).searchParams.has("ready");
  if (!wantsReady) {
    return NextResponse.json({
      status: "ok",
      version: VERSION,
      uptime: Math.round(process.uptime()),
    });
  }
  try {
    await pgDb.execute(sql`select 1`);
    return NextResponse.json({
      status: "ok",
      version: VERSION,
      checks: { db: "ok" },
    });
  } catch {
    return NextResponse.json(
      { status: "error", version: VERSION, checks: { db: "error" } },
      { status: 503 },
    );
  }
}
