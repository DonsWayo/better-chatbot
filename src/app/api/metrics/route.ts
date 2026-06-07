import { ensureMetrics, metricsRegistry } from "lib/observability/metrics";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Prometheus scrape endpoint (ADR-0006). Optionally protect with METRICS_AUTH_TOKEN (Bearer).
export async function GET(request: Request) {
  const token = process.env.METRICS_AUTH_TOKEN;
  if (token && request.headers.get("authorization") !== `Bearer ${token}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  ensureMetrics();
  return new NextResponse(await metricsRegistry.metrics(), {
    status: 200,
    headers: { "content-type": metricsRegistry.contentType },
  });
}
