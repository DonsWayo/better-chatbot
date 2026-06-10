"use client";
import { SidebarMenuButton, useSidebar } from "ui/sidebar";
import { SidebarMenu, SidebarMenuItem } from "ui/sidebar";
import { SidebarGroupContent } from "ui/sidebar";
import { Tooltip } from "ui/tooltip";

import { appStore } from "@/app/store";
import {
  canCreateAgent,
  canCreateWorkflow,
  canEditWorkflow,
} from "lib/auth/client-permissions";
import { Shortcuts, getShortcutKeyList } from "lib/keyboard-shortcuts";
import { fetcher } from "lib/utils";
import { Blocks, Inbox, SearchIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { SidebarGroup } from "ui/sidebar";
import { WriteIcon } from "ui/write-icon";

export function AppSidebarMenus({
  userRole,
}: {
  userRole?: string | null;
}) {
  const router = useRouter();
  const t = useTranslations("");
  const { setOpenMobile } = useSidebar();
  const appStoreMutate = appStore((state) => state.mutate);

  // Studio is the single role-gated builder home — only builders/admins see
  // it (docs/design/information-architecture.md §1).
  const canSeeStudio =
    canCreateAgent(userRole) ||
    canCreateWorkflow(userRole) ||
    canEditWorkflow(userRole);

  // Pending-approvals badge for the always-visible Inbox item.
  const { data: approvalCount } = useSWR<{ pending: number }>(
    "/api/agent-platform/approvals/count",
    fetcher,
    { fallbackData: { pending: 0 }, refreshInterval: 30000 },
  );
  const pendingApprovals = approvalCount?.pending ?? 0;

  return (
    <SidebarGroup>
      <SidebarGroupContent>
        <SidebarMenu>
          <Tooltip>
            <SidebarMenuItem className="mb-1">
              <Link
                href="/"
                onClick={(e) => {
                  e.preventDefault();
                  setOpenMobile(false);
                  router.push(`/`);
                  router.refresh();
                }}
              >
                <SidebarMenuButton className="flex font-semibold group/new-chat bg-input/20 border border-border/40">
                  <WriteIcon className="size-4" />
                  {t("Layout.newChat")}
                  <div className="flex items-center gap-1 text-xs font-medium ml-auto opacity-0 group-hover/new-chat:opacity-100 transition-opacity">
                    {getShortcutKeyList(Shortcuts.openNewChat).map((key) => (
                      <span
                        key={key}
                        className="border w-5 h-5 flex items-center justify-center bg-accent rounded"
                      >
                        {key}
                      </span>
                    ))}
                  </div>
                </SidebarMenuButton>
              </Link>
            </SidebarMenuItem>
          </Tooltip>
        </SidebarMenu>
        <SidebarMenu>
          <Tooltip>
            <SidebarMenuItem>
              <SidebarMenuButton
                className="flex font-semibold group/search"
                data-testid="sidebar-search"
                onClick={() => {
                  setOpenMobile(false);
                  appStoreMutate({ openCommandPalette: true });
                }}
              >
                <SearchIcon className="size-4" />
                {t("Layout.search")}
                <div className="flex items-center gap-1 text-xs font-medium ml-auto opacity-0 group-hover/search:opacity-100 transition-opacity">
                  {getShortcutKeyList(Shortcuts.openCommandPalette).map(
                    (key) => (
                      <span
                        key={key}
                        className="border w-5 h-5 flex items-center justify-center bg-accent rounded"
                      >
                        {key}
                      </span>
                    ),
                  )}
                </div>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </Tooltip>
        </SidebarMenu>
        {/* Inbox is always rendered for everyone — the one door to approvals,
            run history and routines (docs/design/information-architecture.md §5). */}
        <SidebarMenu>
          <Tooltip>
            <SidebarMenuItem>
              <Link href="/inbox" data-testid="sidebar-inbox-link">
                <SidebarMenuButton className="font-semibold">
                  <Inbox className="size-4" />
                  {t("Layout.inbox")}
                  {pendingApprovals > 0 && (
                    <span
                      className="ml-auto rounded-full px-1.5 text-[10px] font-semibold tabular-nums text-black"
                      style={{ backgroundColor: "#FFC72C" }}
                      data-testid="sidebar-inbox-count"
                    >
                      {pendingApprovals}
                    </span>
                  )}
                </SidebarMenuButton>
              </Link>
            </SidebarMenuItem>
          </Tooltip>
        </SidebarMenu>
        {/* Studio — builders/admins only; sits between Inbox and the pinned
            Agents section (docs/design/information-architecture.md §1). */}
        {canSeeStudio && (
          <SidebarMenu>
            <Tooltip>
              <SidebarMenuItem>
                <Link href="/studio" data-testid="sidebar-studio-link">
                  <SidebarMenuButton className="font-semibold">
                    <Blocks className="size-4" />
                    {t("Layout.studio")}
                  </SidebarMenuButton>
                </Link>
              </SidebarMenuItem>
            </Tooltip>
          </SidebarMenu>
        )}
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
