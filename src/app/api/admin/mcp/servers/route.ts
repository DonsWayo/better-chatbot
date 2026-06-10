import { NextRequest, NextResponse } from "next/server";
import { getSession } from "lib/auth/server";
import { pgDb as db } from "lib/db/pg/db.pg";
import { McpServerTable } from "lib/db/pg/schema.pg";
import { inArray } from "drizzle-orm";
import { registerMcpServer } from "lib/admin/mcp-servers";
import { z } from "zod";

const CreateServerSchema = z.object({
  name: z.string().min(1).max(200),
  scope: z.enum(["org", "team"]),
  teamId: z.string().uuid().optional(),
  teamIds: z.array(z.string().uuid()).optional(),
  config: z.object({
    url: z.string().url().optional(),
    command: z.string().min(1).optional(),
    args: z.array(z.string()).optional(),
    env: z.record(z.string(), z.string()).optional(),
    headers: z.record(z.string(), z.string()).optional(),
  }),
  enabled: z.boolean().default(true),
});

/**
 * GET /api/admin/mcp/servers
 * List all company-scoped MCP servers (org + team).
 */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "admin") return NextResponse.json({ error: "Admin required" }, { status: 403 });

  const servers = await db
    .select()
    .from(McpServerTable)
    .where(inArray(McpServerTable.scope, ["org", "team"]));

  return NextResponse.json({ servers });
}

/**
 * POST /api/admin/mcp/servers
 * Register a new company MCP server (org-wide or per-team).
 */
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "admin") return NextResponse.json({ error: "Admin required" }, { status: 403 });

  const body = await request.json();
  const parsed = CreateServerSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { name, scope, teamId, config, enabled } = parsed.data;
  // Accept the multi-team field, with the legacy single teamId as fallback.
  const teamIds = parsed.data.teamIds ?? (teamId ? [teamId] : null);

  if (scope === "team" && (!teamIds || teamIds.length === 0)) {
    return NextResponse.json({ error: "teamIds required when scope=team" }, { status: 400 });
  }

  const server = await registerMcpServer({ name, scope, teamIds, config: config as never, enabled, userId: session.user.id });
  return NextResponse.json({ server }, { status: 201 });
}
