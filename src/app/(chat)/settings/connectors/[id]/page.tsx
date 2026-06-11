import { canManageMCPServer } from "lib/auth/permissions";
import { mcpRepository } from "lib/db/repository";
import { ArrowLeft } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Alert } from "ui/alert";

import { ConnectorDeleteButton } from "@/components/connector-delete-button";
import MCPEditor from "@/components/mcp-editor";
import { ConnectorCustomizationSection } from "@/components/settings/connector-customization-section";

// Settings › Connectors › [id] — modify a connector (moved from
// /mcp/modify/[id]). Per-server instructions and tool customizations
// (formerly the global McpCustomizationPopup) live inline below the editor.
export default async function ConnectorModifyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const t = await getTranslations();
  const mcpClient = await mcpRepository.selectById(id);

  if (!mcpClient) {
    return redirect("/settings/connectors");
  }

  // Same permission removeMcpClientAction enforces server-side (owner of a
  // private server, or admin) — only show the delete affordance when the
  // action would actually succeed.
  const canDelete = await canManageMCPServer(
    mcpClient.userId,
    mcpClient.visibility,
  );

  return (
    <div className="flex flex-col gap-2">
      <Link
        href="/settings/connectors"
        className="flex items-center gap-2 text-muted-foreground text-sm hover:text-foreground transition-colors mb-8"
      >
        <ArrowLeft className="size-3" />
        {t("Common.back")}
      </Link>
      <header className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <h2 className="text-3xl font-semibold my-2">
            {t("MCP.mcpConfiguration")}
          </h2>
          <p className="text text-muted-foreground">
            {t("MCP.configureYourMcpServerConnectionSettings")}
          </p>
        </div>
        {canDelete && (
          <ConnectorDeleteButton id={mcpClient.id} name={mcpClient.name} />
        )}
      </header>

      <main className="my-8 flex flex-col gap-10">
        {mcpClient ? (
          <>
            <MCPEditor
              initialConfig={mcpClient.config}
              name={mcpClient.name}
              id={mcpClient.id}
            />
            <ConnectorCustomizationSection id={mcpClient.id} />
          </>
        ) : (
          <Alert variant="destructive">MCP client not found</Alert>
        )}
      </main>
    </div>
  );
}
