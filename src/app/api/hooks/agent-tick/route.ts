/**
 * POST /api/hooks/agent-tick — Agent Platform #22 cron tick ingress.
 *
 * Lets an external scheduler (EKS CronJob, ECS Scheduled Task, curl) drive
 * worker ticks over HTTP instead of (or alongside) the long-running worker
 * loop (scripts/agent-worker.ts). Each call runs exactly one tick: claim due
 * schedules → queue sessions → claim + execute up to N sessions.
 *
 * Auth (external-consumer rule, docs/CLAUDE.md): header `x-asafe-cron-secret`
 * must match the ASAFE_CRON_SECRET env var. 503 when the env var is unset
 * (the endpoint is not configured), 401 on a missing/wrong secret.
 */

import { tickOnce } from "lib/agent-platform/worker";
import globalLogger from "logger";
import { type NextRequest, NextResponse } from "next/server";

const logger = globalLogger.withDefaults({ message: "hooks/agent-tick: " });

export async function POST(request: NextRequest) {
  const secret = process.env.ASAFE_CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "ASAFE_CRON_SECRET is not configured" },
      { status: 503 },
    );
  }
  if (request.headers.get("x-asafe-cron-secret") !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const counts = await tickOnce();
  logger.info(
    `tick: scheduled=${counts.scheduled} executed=${counts.executed} failed=${counts.failed}`,
  );
  return NextResponse.json(counts);
}
