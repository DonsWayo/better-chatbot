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
    // saveMcpClientAction returns a structured result (it never throws for
    // expected failures) carrying both a user-safe message and a coarse `kind`
    // so we can pick the right 4xx status WITHOUT re-parsing the message.
    const result = await saveMcpClientAction(json);
    if (result.success) {
      return NextResponse.json({ success: true, id: result.id });
    }

    // The action already mapped the failure to a clean, user-safe message:
    //  • kind "connection": the server URL was unreachable — a client/
    //    validation error → 422. The raw transport string (ECONNREFUSED,
    //    host/port, "fetch failed", "SSE error", stack-class) is NEVER
    //    surfaced; only the safe MCP_CONNECTION_ERROR_MESSAGE is.
    //  • authorization failures (non-admin org/team scope, no create
    //    permission, not logged in) → 403.
    //  • anything else (name validation, duplicate, policy) → 422.
    if (result.kind === "connection") {
      logger.warn("MCP save failed: server unreachable");
      return NextResponse.json({ message: result.error }, { status: 422 });
    }

    const isAuthzError =
      /administrator|permission|not allowed|must be logged in/i.test(
        result.error,
      );
    if (isAuthzError) {
      return NextResponse.json({ message: result.error }, { status: 403 });
    }
    // Remaining structured failures are user-correctable input/policy errors.
    return NextResponse.json({ message: result.error }, { status: 422 });
  } catch (error) {
    // Only truly unexpected throws (the action itself returns structured
    // results) reach here. Never echo the raw error to the client.
    logger.error("Failed to save MCP client", { error });
    return NextResponse.json(
      { message: "Failed to save the MCP connection. Please try again." },
      { status: 500 },
    );
  }
}
