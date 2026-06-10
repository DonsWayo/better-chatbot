import {
  type AuditActorType,
  type AuditLogRow,
  COMPLIANCE_EXPORT_MAX_ROWS,
  COMPLIANCE_EXPORT_PAGE_SIZE,
  getAuditLog,
} from "lib/admin/audit";
import { getSession } from "lib/auth/server";
import { NextRequest, NextResponse } from "next/server";

const CSV_HEADER =
  "id,created_at,actor_type,agent_session_id,user_id,user_email,team_id,event_type,details\n";

/**
 * GET /api/admin/compliance/export
 *
 * Streams the audit trail as a CSV attachment for auditors. Admin-only.
 * Same filters as /api/admin/compliance/audit (from, to, userId, teamId,
 * actorType, eventType, agentSessionId). Capped at
 * COMPLIANCE_EXPORT_MAX_ROWS rows; appends a "# truncated" comment row
 * when the cap is hit.
 */
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "admin")
    return NextResponse.json({ error: "Admin required" }, { status: 403 });

  const { searchParams } = request.nextUrl;
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

  const filters = {
    eventType,
    userId,
    teamId,
    actorType,
    agentSessionId,
    from,
    to,
  };

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        controller.enqueue(encoder.encode(CSV_HEADER));

        let written = 0;
        let total = 0;
        for (;;) {
          const pageLimit = Math.min(
            COMPLIANCE_EXPORT_PAGE_SIZE,
            COMPLIANCE_EXPORT_MAX_ROWS - written,
          );
          if (pageLimit <= 0) break;

          const { rows, total: pageTotal } = await getAuditLog({
            ...filters,
            limit: pageLimit,
            offset: written,
          });
          total = pageTotal;
          if (rows.length === 0) break;

          const lines = rows.map((row) => toCsvLine(row)).join("");
          controller.enqueue(encoder.encode(lines));
          written += rows.length;

          if (rows.length < pageLimit) break;
        }

        if (total > COMPLIANCE_EXPORT_MAX_ROWS) {
          controller.enqueue(encoder.encode("# truncated\n"));
        }
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });

  const fromLabel = from ? from.toISOString().slice(0, 10) : "start";
  const toLabel = (to ?? new Date()).toISOString().slice(0, 10);
  const filename = `asafe-compliance-${fromLabel}-${toLabel}.csv`;

  return new NextResponse(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

function toCsvLine(row: AuditLogRow): string {
  const cells = [
    row.id,
    row.createdAt instanceof Date
      ? row.createdAt.toISOString()
      : String(row.createdAt),
    row.actorType,
    row.agentSessionId ?? "",
    row.userId,
    row.userEmail ?? "",
    row.teamId ?? "",
    row.eventType,
    typeof row.details === "string"
      ? row.details
      : JSON.stringify(row.details ?? {}),
  ];
  return `${cells.map(csvEscape).join(",")}\n`;
}

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
