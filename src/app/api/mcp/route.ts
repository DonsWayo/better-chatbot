import { getSession } from "auth/server";
import { logger } from "better-auth";
import { canCreateMCP } from "lib/auth/permissions";
import { McpServerTable } from "lib/db/pg/schema.pg";
import { NextResponse } from "next/server";
import { saveMcpClientAction } from "./actions";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Check if user has permission to create MCP connections
  const hasPermission = await canCreateMCP();
  if (!hasPermission) {
    return NextResponse.json(
      { error: "You don't have permission to create MCP connections" },
      { status: 403 },
    );
  }

  const json = (await request.json()) as typeof McpServerTable.$inferInsert;

  try {
    // saveMcpClientAction returns a structured result (it no longer throws
    // for expected failures); normalize back to an exception so the status
    // mapping below covers both structured errors and unexpected throws.
    const result = await saveMcpClientAction(json);
    if (!result.success) {
      throw new Error(result.error);
    }

    return NextResponse.json({ success: true, id: result.id });
  } catch (error) {
    logger.error("Failed to save MCP client", { error });
    const message =
      error instanceof Error ? error.message : "Failed to save MCP client";
    // Authorization failures thrown from the action (e.g. a non-admin trying to
    // register an org/team-scoped server, or a user without create permission)
    // are client errors, not server errors — surface them as 403, not 500.
    const isAuthzError =
      /administrator|permission|not allowed|must be logged in/i.test(message);
    return NextResponse.json({ message }, { status: isAuthzError ? 403 : 500 });
  }
}
