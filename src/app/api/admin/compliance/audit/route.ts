import {
  type AuditActorType,
  COMPLIANCE_AUDIT_DEFAULT_LIMIT,
  COMPLIANCE_AUDIT_MAX_LIMIT,
  getAuditLog,
} from "lib/admin/audit";
import { getSession } from "lib/auth/server";
import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/admin/compliance/audit
 *
 * Read-only audit trail for auditors/compliance export tooling. Admin-only.
 *
 * Query params: from, to (ISO dates), userId, teamId, actorType
 * ("human"|"agent"), eventType, agentSessionId, limit (default 100,
 * max 1000), offset (default 0).
 *
 * Response: { items, total, limit, offset }
 */
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "admin")
    return NextResponse.json({ error: "Admin required" }, { status: 403 });

  const { searchParams } = request.nextUrl;

  const limitRaw = parseInt(searchParams.get("limit") ?? "", 10);
  const limit = Math.min(
    COMPLIANCE_AUDIT_MAX_LIMIT,
    Math.max(
      1,
      Number.isNaN(limitRaw) ? COMPLIANCE_AUDIT_DEFAULT_LIMIT : limitRaw,
    ),
  );
  const offsetRaw = parseInt(searchParams.get("offset") ?? "", 10);
  const offset = Math.max(0, Number.isNaN(offsetRaw) ? 0 : offsetRaw);

  const eventType = searchParams.get("eventType") ?? undefined;
  const userId = searchParams.get("userId") ?? undefined;
  const teamId = searchParams.get("teamId") ?? undefined;
  const agentSessionId = searchParams.get("agentSessionId") ?? undefined;

  const actorTypeParam = searchParams.get("actorType");
  if (
    actorTypeParam &&
    actorTypeParam !== "human" &&
    actorTypeParam !== "agent"
  )
    return NextResponse.json({ error: "Invalid actorType" }, { status: 400 });
  const actorType = (actorTypeParam ?? undefined) as AuditActorType | undefined;

  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");
  const from = fromParam ? new Date(fromParam) : undefined;
  const to = toParam ? new Date(toParam) : undefined;
  if (from && isNaN(from.getTime()))
    return NextResponse.json({ error: "Invalid from date" }, { status: 400 });
  if (to && isNaN(to.getTime()))
    return NextResponse.json({ error: "Invalid to date" }, { status: 400 });

  const { rows, total } = await getAuditLog({
    limit,
    offset,
    eventType,
    userId,
    teamId,
    actorType,
    agentSessionId,
    from,
    to,
  });

  return NextResponse.json({ items: rows, total, limit, offset });
}
