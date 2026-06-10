import { getSession } from "auth/server";
import { IS_VERCEL_ENV } from "lib/const";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";

import MCPDashboard from "@/components/mcp-dashboard";

// Settings › Connectors — the personal MCP home (the old /mcp page moved
// here). Shows only the org/team-enabled subset (the list API already
// scopes it). docs/design/information-architecture.md §2.
export const dynamic = "force-dynamic";

export default async function ConnectorsPage() {
  const session = await getSession();
  if (!session?.user) {
    return redirect("/sign-in");
  }

  const isAddingDisabled = process.env.NOT_ALLOW_ADD_MCP_SERVERS;

  const t = await getTranslations("Info");
  let message: string | undefined;

  if (isAddingDisabled) {
    message = t("mcpAddingDisabled");
  } else if (IS_VERCEL_ENV) {
    message = t("vercelSyncDelay");
  }

  return <MCPDashboard message={message} user={session.user} />;
}
