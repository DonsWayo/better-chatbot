import { getComplianceUsageSummary } from "lib/admin/teams";
import { getSession } from "lib/auth/server";
import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/admin/compliance/usage
 *
 * Aggregated usage events (asafe_usage_event) for auditors. Admin-only.
 *
 * Query params: from, to (ISO dates), teamId, userId.
 *
 * Response: {
 *   byModel: [{ model, requests, inputTokens, outputTokens, costUsd }],
 *   byTeam:  [{ teamId, teamName, requests, inputTokens, outputTokens, costUsd }],
 *   total:   { requests, inputTokens, outputTokens, costUsd }
 * }
 */
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "admin")
    return NextResponse.json({ error: "Admin required" }, { status: 403 });

  const { searchParams } = request.nextUrl;
  const teamId = searchParams.get("teamId") ?? undefined;
  const userId = searchParams.get("userId") ?? undefined;

  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");
  const from = fromParam ? new Date(fromParam) : undefined;
  const to = toParam ? new Date(toParam) : undefined;
  if (from && isNaN(from.getTime()))
    return NextResponse.json({ error: "Invalid from date" }, { status: 400 });
  if (to && isNaN(to.getTime()))
    return NextResponse.json({ error: "Invalid to date" }, { status: 400 });

  const summary = await getComplianceUsageSummary({ from, to, teamId, userId });

  return NextResponse.json(summary);
}
