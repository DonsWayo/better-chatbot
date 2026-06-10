"use client";

import { formatDistanceToNow } from "date-fns";
import { Inbox, MessageCircle, Terminal, Workflow, X } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import useSWR, { mutate } from "swr";
import { handleErrorWithToast } from "ui/shared-toast";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
} from "ui/sidebar";

import { cancelRunAction } from "@/app/api/runs/actions";
import { cn, fetcher } from "lib/utils";

// Client-safe shape of an AgentSessionEntity serialized over /api/runs
// (dates arrive as ISO strings). Kept local so the drizzle schema and the
// server-only sessions lib never enter the client bundle.
type RunSession = {
  id: string;
  kind: "workflow" | "conversational" | "opencode";
  status:
    | "queued"
    | "running"
    | "awaiting_approval"
    | "paused"
    | "completed"
    | "failed"
    | "cancelled";
  costSoFar: number;
  createdAt: string;
  startedAt: string | null;
  endedAt: string | null;
};

const DISPLAY_LIMIT = 8;

const NON_TERMINAL: RunSession["status"][] = [
  "queued",
  "running",
  "awaiting_approval",
  "paused",
];

const STATUS_LABEL_KEY: Record<RunSession["status"], string> = {
  queued: "queued",
  running: "running",
  awaiting_approval: "awaitingApproval",
  paused: "paused",
  completed: "completed",
  failed: "failed",
  cancelled: "cancelled",
};

function StatusDot({ status }: { status: RunSession["status"] }) {
  if (status === "running") {
    return (
      <span
        className="size-2 shrink-0 rounded-full animate-pulse"
        style={{ backgroundColor: "#FFC72C" }}
      />
    );
  }
  return (
    <span
      className={cn(
        "size-2 shrink-0 rounded-full",
        status === "queued" && "bg-muted-foreground/50",
        status === "paused" && "bg-muted-foreground/50",
        status === "awaiting_approval" && "bg-amber-500",
        status === "completed" && "bg-green-500",
        (status === "failed" || status === "cancelled") && "bg-red-500",
      )}
    />
  );
}

function KindIcon({ kind }: { kind: RunSession["kind"] }) {
  if (kind === "workflow")
    return <Workflow className="size-3.5 shrink-0 text-muted-foreground" />;
  if (kind === "opencode")
    return <Terminal className="size-3.5 shrink-0 text-muted-foreground" />;
  return <MessageCircle className="size-3.5 shrink-0 text-muted-foreground" />;
}

export function AppSidebarRuns() {
  const t = useTranslations("Runs");

  const { data: runs } = useSWR<RunSession[]>("/api/runs", fetcher, {
    onError: handleErrorWithToast,
    fallbackData: [],
    refreshInterval: (latest) =>
      latest?.some((run) => NON_TERMINAL.includes(run.status)) ? 5000 : 30000,
  });

  // Pending-approvals badge for the Triage inbox link (#26).
  const { data: approvalCount } = useSWR<{ pending: number }>(
    "/api/agent-platform/approvals/count",
    fetcher,
    { fallbackData: { pending: 0 }, refreshInterval: 30000 },
  );
  const pendingApprovals = approvalCount?.pending ?? 0;

  const handleCancel = async (id: string) => {
    // Optimistic flip to cancelled, then reconcile with the server.
    mutate(
      "/api/runs",
      (current: RunSession[] | undefined) =>
        current?.map((run) =>
          run.id === id ? { ...run, status: "cancelled" as const } : run,
        ),
      false,
    );
    try {
      await cancelRunAction(id);
    } catch (error) {
      handleErrorWithToast(error as Error);
    } finally {
      mutate("/api/runs");
    }
  };

  // No clutter: hide the whole group until the user has at least one run.
  if (!runs || runs.length === 0) return null;

  return (
    <SidebarGroup>
      <SidebarGroupContent className="group-data-[collapsible=icon]:hidden group/runs">
        <SidebarMenu data-testid="runs-sidebar-menu">
          <SidebarMenuItem>
            <SidebarGroupLabel className="justify-between pr-1">
              <h4 className="text-xs text-muted-foreground group-hover/runs:text-foreground transition-colors">
                {t("title")}
              </h4>
              <Link
                href="/triage"
                className="flex items-center gap-1 rounded-full px-1.5 py-0.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                title={t("triage")}
                aria-label={t("triage")}
                data-testid="sidebar-triage-link"
              >
                <Inbox className="size-3.5" />
                {pendingApprovals > 0 && (
                  <span
                    className="rounded-full px-1.5 text-[10px] font-semibold tabular-nums text-black"
                    style={{ backgroundColor: "#FFC72C" }}
                    data-testid="sidebar-triage-count"
                  >
                    {pendingApprovals}
                  </span>
                )}
              </Link>
            </SidebarGroupLabel>
          </SidebarMenuItem>
          {runs.slice(0, DISPLAY_LIMIT).map((run) => {
            const isActive = NON_TERMINAL.includes(run.status);
            return (
              <SidebarMenuItem key={run.id} className="group/run px-2">
                <SidebarMenuButton asChild className="w-full">
                  <Link
                    href={`/runs/${run.id}`}
                    className="flex items-center gap-2 min-w-0"
                    data-testid="sidebar-run-row"
                  >
                    <StatusDot status={run.status} />
                    <KindIcon kind={run.kind} />
                    <span className="truncate min-w-0 text-xs">
                      {t(STATUS_LABEL_KEY[run.status])}
                    </span>
                    {run.status === "awaiting_approval" && (
                      <span
                        className="shrink-0 rounded-full bg-amber-500/15 px-1.5 py-px text-[9px] font-medium text-amber-600 dark:text-amber-400"
                        data-testid="needs-approval-pill"
                      >
                        {t("needsApproval")}
                      </span>
                    )}
                    <span className="ml-auto flex items-center gap-1 text-[10px] text-muted-foreground">
                      <span className="truncate">
                        {formatDistanceToNow(new Date(run.createdAt), {
                          addSuffix: true,
                        })}
                      </span>
                      {run.costSoFar > 0 && (
                        <span className="tabular-nums">
                          ${run.costSoFar.toFixed(4)}
                        </span>
                      )}
                    </span>
                  </Link>
                </SidebarMenuButton>
                {isActive && (
                  <SidebarMenuAction
                    className="opacity-0 group-hover/run:opacity-100 transition-opacity"
                    title={t("cancelRun")}
                    aria-label={t("cancelRun")}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleCancel(run.id);
                    }}
                  >
                    <X className="size-3.5" />
                  </SidebarMenuAction>
                )}
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
