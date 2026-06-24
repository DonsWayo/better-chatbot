"use client";

import { listEpicsAction } from "@/app/api/tasks/actions";
import type { EpicSummary } from "lib/db/pg/repositories/epic-repository.pg";
import { LayoutList } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname } from "next/navigation";
import useSWR from "swr";
import { handleErrorWithToast } from "ui/shared-toast";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarMenuSub,
  SidebarMenuSubItem,
} from "ui/sidebar";
import { Tooltip, TooltipContent, TooltipTrigger } from "ui/tooltip";
import { Button } from "ui/button";

const SWR_KEY = "sidebar-tasks-epics";
const RECENT_LIMIT = 4;

export function AppSidebarTasks() {
  const t = useTranslations("Tasks");
  const tLayout = useTranslations("Layout");
  const pathname = usePathname();

  const { data: epics = [], isLoading } = useSWR<EpicSummary[]>(
    SWR_KEY,
    async () => {
      const result = await listEpicsAction();
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    { onError: handleErrorWithToast, fallbackData: [] },
  );

  const recent = epics.slice(0, RECENT_LIMIT);
  const hasMore = epics.length > RECENT_LIMIT;

  return (
    <SidebarGroup>
      <SidebarGroupContent className="group-data-[collapsible=icon]:hidden group/tasks">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarGroupLabel className="">
              <h4 className="text-xs text-muted-foreground group-hover/tasks:text-foreground transition-colors">
                {tLayout("tasks")}
              </h4>
              <div className="flex-1" />
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="opacity-0 group-hover/tasks:opacity-100 transition-opacity"
                    asChild
                  >
                    <Link href="/tasks" aria-label={t("epics")}>
                      <LayoutList className="size-3.5" />
                    </Link>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">{t("epics")}</TooltipContent>
              </Tooltip>
            </SidebarGroupLabel>

            {isLoading ? (
              Array.from({ length: 2 }).map((_, index) => (
                <SidebarMenuSkeleton key={index} />
              ))
            ) : recent.length === 0 ? (
              <div className="px-2 py-4 text-center">
                <p className="text-sm text-muted-foreground">{t("noEpics")}</p>
              </div>
            ) : (
              recent.map((epic) => (
                <SidebarMenuSub key={epic.id} className="group/epic mr-0">
                  <SidebarMenuSubItem>
                    <Tooltip delayDuration={1000}>
                      <TooltipTrigger asChild>
                        <SidebarMenuButton
                          asChild
                          isActive={pathname === `/tasks/${epic.id}`}
                        >
                          <Link
                            href={`/tasks/${epic.id}`}
                            className="flex items-center gap-2"
                          >
                            <LayoutList className="size-3.5 shrink-0 text-muted-foreground" />
                            <p className="truncate min-w-0">{epic.title}</p>
                          </Link>
                        </SidebarMenuButton>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-[200px] p-3">
                        <p className="font-medium text-xs">{epic.title}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {epic.taskDone}/{epic.taskTotal} tasks done
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </SidebarMenuSubItem>
                </SidebarMenuSub>
              ))
            )}

            {hasMore && (
              <div className="w-full flex px-2 pt-1">
                <Button
                  asChild
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start text-muted-foreground hover:bg-input!"
                >
                  <Link href="/tasks">{tLayout("seeAllTasks")}</Link>
                </Button>
              </div>
            )}
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
