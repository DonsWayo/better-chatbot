"use client";

import { Loader } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo } from "react";

import { useMcpList } from "@/hooks/queries/use-mcp-list";
import { McpServerCustomizationContent } from "@/components/mcp-customization-popup";

// Inline per-connector instructions + tool customizations. This replaces the
// globally mounted McpCustomizationPopup and the Chat Preferences "MCP
// instructions" pane — both now live on the connector row.
// docs/design/information-architecture.md §2.
export function ConnectorCustomizationSection({ id }: { id: string }) {
  const t = useTranslations();
  const { data: mcpList, isLoading } = useMcpList();

  const server = useMemo(
    () => mcpList?.find((s) => s.id === id),
    [mcpList, id],
  );

  if (isLoading && !server) {
    return (
      <section className="rounded-2xl border bg-card p-6 shadow-xs">
        <div className="flex items-center justify-center py-8 text-muted-foreground">
          <Loader className="size-4 animate-spin" />
        </div>
      </section>
    );
  }

  if (!server) {
    return null;
  }

  return (
    <section className="rounded-2xl border bg-card p-6 shadow-xs">
      <McpServerCustomizationContent
        mcpServerInfo={{ ...server, id: server.id }}
        title={t("MCP.mcpServerCustomization")}
        inline
      />
    </section>
  );
}
