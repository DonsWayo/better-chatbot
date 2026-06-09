import { NextRequest, NextResponse } from "next/server";
import { getSession } from "lib/auth/server";
import { updateMcpServer, deleteMcpServer } from "lib/admin/mcp-servers";
import { z } from "zod";

const PatchServerSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  enabled: z.boolean().optional(),
  scope: z.enum(["org", "team"]).optional(),
  teamId: z.string().uuid().nullable().optional(),
});

/**
 * PATCH /api/admin/mcp/servers/[id]
 * Update a company MCP server's settings.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "admin") return NextResponse.json({ error: "Admin required" }, { status: 403 });

  const { id } = await params;
  const body = await request.json();
  const parsed = PatchServerSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const updated = await updateMcpServer(id, parsed.data);
  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ server: updated });
}

/**
 * DELETE /api/admin/mcp/servers/[id]
 * Remove a company MCP server from the registry.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "admin") return NextResponse.json({ error: "Admin required" }, { status: 403 });

  const { id } = await params;
  const deletedId = await deleteMcpServer(id);
  if (!deletedId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true, id: deletedId });
}
