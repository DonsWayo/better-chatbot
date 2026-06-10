"use client";

import { LibraryBig, MessageCircle, Waypoints } from "lucide-react";
import { useTranslations } from "next-intl";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { type ReactNode, useCallback } from "react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "ui/tabs";

// Studio — the single builder home with Agents, Workflows and Knowledge tabs
// (docs/design/information-architecture.md §4). The active tab is reflected
// in the URL (?tab=agents|workflows|knowledge) so /agents and /workflow can
// redirect into the matching tab.
export function StudioTabs({
  agentsSlot,
  workflowsSlot,
  knowledgeSlot,
}: {
  agentsSlot: ReactNode;
  workflowsSlot: ReactNode;
  knowledgeSlot: ReactNode;
}) {
  const t = useTranslations("Studio");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const tabParam = searchParams.get("tab");
  const tab =
    tabParam === "workflows" || tabParam === "knowledge" ? tabParam : "agents";

  const onTabChange = useCallback(
    (next: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next === "workflows" || next === "knowledge") {
        params.set("tab", next);
      } else {
        params.delete("tab");
      }
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  return (
    <Tabs
      value={tab}
      onValueChange={onTabChange}
      className="w-full"
      data-testid="studio-tabs"
    >
      <div className="px-4 pt-4 md:px-8">
        <TabsList>
          <TabsTrigger value="agents" data-testid="studio-tab-agents">
            <MessageCircle className="size-4" />
            {t("agents")}
          </TabsTrigger>
          <TabsTrigger value="workflows" data-testid="studio-tab-workflows">
            <Waypoints className="size-4" />
            {t("workflows")}
          </TabsTrigger>
          <TabsTrigger value="knowledge" data-testid="studio-tab-knowledge">
            <LibraryBig className="size-4" />
            {t("knowledge")}
          </TabsTrigger>
        </TabsList>
      </div>
      <TabsContent value="agents" className="mt-0">
        {agentsSlot}
      </TabsContent>
      <TabsContent value="workflows" className="mt-0">
        {workflowsSlot}
      </TabsContent>
      <TabsContent value="knowledge" className="mt-0">
        {knowledgeSlot}
      </TabsContent>
    </Tabs>
  );
}
