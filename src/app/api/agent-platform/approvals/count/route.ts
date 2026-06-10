import { getSession } from "auth/server";
import { listPendingApprovalsForUser } from "lib/agent-platform/approvals";
import { getIsUserAdmin } from "lib/user/utils";

// Agent Platform #26 — pending-approvals badge for the sidebar Triage item.
// Client-side SWR polling → Route (docs/CLAUDE.md decision matrix).

export async function GET() {
  const session = await getSession();

  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  const pending = await listPendingApprovalsForUser(
    session.user.id,
    getIsUserAdmin(session.user),
  );
  return Response.json({ pending: pending.length });
}
