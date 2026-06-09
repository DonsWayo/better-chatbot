import { NextRequest, NextResponse } from "next/server";
import { getSession } from "lib/auth/server";
import { getAuditLog } from "lib/admin/audit";

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "admin") return NextResponse.json({ error: "Admin required" }, { status: 403 });

  const { searchParams } = request.nextUrl;
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const limit = Math.min(200, Math.max(1, parseInt(searchParams.get("limit") ?? "50", 10)));
  const eventType = searchParams.get("eventType") ?? undefined;
  const userId = searchParams.get("userId") ?? undefined;
  const teamId = searchParams.get("teamId") ?? undefined;
  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");

  const from = fromParam ? new Date(fromParam) : undefined;
  const to = toParam ? new Date(toParam) : undefined;

  if (from && isNaN(from.getTime())) return NextResponse.json({ error: "Invalid from date" }, { status: 400 });
  if (to && isNaN(to.getTime())) return NextResponse.json({ error: "Invalid to date" }, { status: 400 });

  const { rows, total } = await getAuditLog({ page, limit, eventType, userId, teamId, from, to });

  return NextResponse.json({ rows, total, page, limit });
}
