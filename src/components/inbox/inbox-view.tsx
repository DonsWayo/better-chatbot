"use client";

import { format, formatDistanceToNow } from "date-fns";
import { EmptyState } from "ui/empty-state";
import {
  CheckCircle2,
  ChevronRight,
  CircleSlash,
  Clock,
  Inbox as InboxIcon,
  Loader2,
  Search,
  ShieldQuestion,
  TerminalSquare,
  XCircle,
} from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { ApprovalDecisionButtons } from "@/components/runs/approval-decision-buttons";
import {
  type RoutineItem,
  RoutinesList,
} from "@/components/runs/routines-list";
import { RunCopyButton } from "@/components/runs/run-copy-button";
import type { AgentSessionStatus } from "lib/agent-platform/sessions";
import { cn } from "lib/utils";
import { Badge } from "ui/badge";
import { Input } from "ui/input";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "ui/resizable";
import { ScrollArea } from "ui/scroll-area";
import { Tabs, TabsList, TabsTrigger } from "ui/tabs";

/* ── serializable item shapes (dates as ISO strings) ─────────────────────── */

export type InboxApprovalItem = {
  id: string;
  kind: "approval";
  variant: "run" | "local-mcp";
  requestId: string;
  runId: string | null;
  runKind: string | null;
  role: string;
  message: string | null;
  serverName: string | null;
  toolName: string | null;
  requestedAt: string;
};

export type InboxRunItem = {
  id: string;
  kind: "run";
  runId: string;
  runKind: string;
  status: AgentSessionStatus;
  cost: number;
  createdAt: string;
  origin: string;
  isRoutine: boolean;
};

type InboxItem = InboxApprovalItem | InboxRunItem;

/* ── status visuals ──────────────────────────────────────────────────────── */

const STATUS_DOT: Record<AgentSessionStatus, string> = {
  queued: "bg-muted-foreground/40",
  running: "bg-primary",
  awaiting_approval: "bg-amber-500",
  paused: "bg-muted-foreground/40",
  completed: "bg-green-500",
  failed: "bg-red-500",
  cancelled: "bg-red-500/60",
};

const STATUS_BADGE: Record<AgentSessionStatus, string> = {
  queued: "bg-muted text-muted-foreground",
  running: "bg-primary/15 text-[#0E7C83] dark:text-primary",
  awaiting_approval: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  paused: "bg-muted text-muted-foreground",
  completed: "bg-green-500/15 text-green-600 dark:text-green-400",
  failed: "bg-red-500/15 text-red-600 dark:text-red-400",
  cancelled: "bg-red-500/15 text-red-600 dark:text-red-400",
};

function StatusIcon({ status }: { status: AgentSessionStatus }) {
  const cls = "size-3.5";
  if (status === "running" || status === "queued")
    return <Loader2 className={cn(cls, "animate-spin text-primary")} />;
  if (status === "awaiting_approval")
    return <ShieldQuestion className={cn(cls, "text-amber-500")} />;
  if (status === "completed")
    return <CheckCircle2 className={cn(cls, "text-green-500")} />;
  if (status === "failed")
    return <XCircle className={cn(cls, "text-red-500")} />;
  return <CircleSlash className={cn(cls, "text-muted-foreground")} />;
}

type TabKey = "approvals" | "runs" | "routines";

export function InboxView({
  approvals,
  runs,
  routines,
}: {
  approvals: InboxApprovalItem[];
  runs: InboxRunItem[];
  routines: RoutineItem[];
}) {
  const t = useTranslations("Triage");
  const tRuns = useTranslations("Runs");

  const [tab, setTab] = useState<TabKey>(
    approvals.length > 0 ? "approvals" : "runs",
  );
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(
    approvals[0]?.id ?? runs[0]?.id ?? null,
  );
  // On phones the two panes can't sit side by side, so we show one at a time:
  // the list, then the selected item's detail with a back affordance. We render
  // ONE layout (never both) so the testids/markup aren't duplicated.
  const [mobileDetail, setMobileDetail] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const RUN_STATUS_LABEL: Record<AgentSessionStatus, string> = {
    queued: tRuns("queued"),
    running: tRuns("running"),
    awaiting_approval: tRuns("awaitingApproval"),
    paused: tRuns("paused"),
    completed: tRuns("completed"),
    failed: tRuns("failed"),
    cancelled: tRuns("cancelled"),
  };

  const list: InboxItem[] = tab === "approvals" ? approvals : runs;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter((item) => {
      if (item.kind === "approval") {
        return [item.runKind, item.message, item.serverName, item.toolName]
          .filter(Boolean)
          .some((s) => (s as string).toLowerCase().includes(q));
      }
      return [item.runKind, item.origin, item.status]
        .filter(Boolean)
        .some((s) => s.toLowerCase().includes(q));
    });
  }, [list, query]);

  const selected =
    filtered.find((i) => i.id === selectedId) ?? filtered[0] ?? null;

  const header = (
    <div className="flex items-center gap-3 border-b px-5 py-4">
      <span className="flex size-9 items-center justify-center rounded-xl bg-primary/15">
        <InboxIcon className="size-[18px] text-[#0E7C83] dark:text-primary" />
      </span>
      <div className="min-w-0">
        <h1 className="font-display text-base font-semibold tracking-tight">
          {t("title")}
        </h1>
        <p className="truncate text-xs text-muted-foreground">{t("subtitle")}</p>
      </div>
    </div>
  );

  const tabsBar = (
    <div className="flex flex-col gap-3 border-b px-4 py-3">
      <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
        <TabsList className="grid w-full grid-cols-3 rounded-full">
          <TabsTrigger value="approvals" className="rounded-full text-xs">
            {t("inboxTab")}
            {approvals.length > 0 && (
              <Badge className="ml-1.5 h-4 min-w-4 justify-center rounded-full border-transparent bg-primary px-1 text-[10px] text-primary-foreground tabular-nums">
                {approvals.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="runs" className="rounded-full text-xs">
            {t("runsTab")}
          </TabsTrigger>
          <TabsTrigger value="routines" className="rounded-full text-xs">
            {t("routinesTab")}
          </TabsTrigger>
        </TabsList>
      </Tabs>
      {tab !== "routines" && (
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("searchPlaceholder")}
            className="h-9 rounded-full pl-9 text-sm"
            data-testid="inbox-search"
          />
        </div>
      )}
    </div>
  );

  // Routines tab is a management surface, not a triage stream — render it
  // full-width (mail apps do the same for settings-like views).
  if (tab === "routines") {
    return (
      <div className="flex h-full flex-col">
        {header}
        {tabsBar}
        <ScrollArea className="flex-1">
          <div className="mx-auto w-full max-w-2xl px-5 py-5">
            <RoutinesList routines={routines} />
          </div>
        </ScrollArea>
      </div>
    );
  }

  const listPane = (
    <div className="flex h-full flex-col">
      <ScrollArea className="flex-1">
        <ul className="flex flex-col gap-1 p-2" data-testid="inbox-list">
          {filtered.length === 0 ? (
            <li className="px-3 py-4">
              <EmptyState
                compact
                icon={tab === "approvals" ? ShieldQuestion : Clock}
                title={tab === "approvals" ? t("emptyApprovals") : t("emptyRuns")}
              />
            </li>
          ) : (
            filtered.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedId(item.id);
                    setMobileDetail(true);
                  }}
                  data-testid="inbox-item"
                  className={cn(
                    "flex w-full flex-col gap-1 rounded-xl px-3 py-2.5 text-left transition-colors",
                    selected?.id === item.id
                      ? "bg-primary/10 ring-1 ring-primary/30"
                      : "hover:bg-muted/60",
                  )}
                >
                  <div className="flex items-center gap-2">
                    {item.kind === "approval" ? (
                      item.variant === "local-mcp" ? (
                        <TerminalSquare className="size-3.5 shrink-0 text-amber-500" />
                      ) : (
                        <ShieldQuestion className="size-3.5 shrink-0 text-amber-500" />
                      )
                    ) : (
                      <StatusIcon status={item.status} />
                    )}
                    <span className="truncate text-sm font-medium capitalize">
                      {item.kind === "approval"
                        ? item.variant === "local-mcp"
                          ? t("localMcpTitle", { server: item.serverName ?? "" })
                          : `${tRuns("title")} · ${item.runKind ?? ""}`
                        : item.runKind}
                    </span>
                    {item.kind === "approval" && (
                      <span className="ml-auto size-2 shrink-0 rounded-full bg-amber-500" />
                    )}
                    {item.kind === "run" && (
                      <span className="ml-auto text-[11px] text-muted-foreground tabular-nums">
                        {RUN_STATUS_LABEL[item.status]}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 pl-[22px]">
                    <span className="truncate text-xs text-muted-foreground">
                      {item.kind === "approval"
                        ? (item.message ??
                          t(
                            item.variant === "local-mcp"
                              ? "localMcpTtlNote"
                              : "pendingApprovals",
                          ))
                        : item.isRoutine
                          ? t("routinesTab")
                          : item.origin}
                    </span>
                    <span className="ml-auto shrink-0 text-[11px] text-muted-foreground tabular-nums">
                      {formatDistanceToNow(
                        new Date(
                          item.kind === "approval"
                            ? item.requestedAt
                            : item.createdAt,
                        ),
                        { addSuffix: true },
                      )}
                    </span>
                  </div>
                </button>
              </li>
            ))
          )}
        </ul>
      </ScrollArea>
    </div>
  );

  const detailBody = !selected ? (
    <div className="flex h-full min-h-64 flex-col items-center justify-center gap-2 text-center">
      <InboxIcon className="size-8 text-muted-foreground/40" />
      <p className="text-sm font-medium">{t("noSelectionTitle")}</p>
      <p className="max-w-xs text-xs text-muted-foreground">
        {t("noSelectionBody")}
      </p>
    </div>
  ) : selected.kind === "approval" ? (
    <ApprovalDetail item={selected} />
  ) : (
    <RunDetail item={selected} statusLabel={RUN_STATUS_LABEL} />
  );

  return (
    <div className="flex h-full flex-col">
      {header}
      {tabsBar}

      {isMobile ? (
        /* Mobile: one pane at a time — list, then detail with a back button. */
        <div className="flex flex-1 flex-col overflow-hidden">
          {mobileDetail && selected ? (
            <>
              <button
                type="button"
                onClick={() => setMobileDetail(false)}
                className="flex items-center gap-1.5 border-b px-4 py-3 text-sm font-medium text-muted-foreground"
                data-testid="inbox-back"
              >
                <ChevronRight className="size-4 rotate-180" />
                {t("inboxTab")}
              </button>
              <ScrollArea className="flex-1">
                <div className="px-4 py-5" data-testid="inbox-detail">
                  {detailBody}
                </div>
              </ScrollArea>
            </>
          ) : (
            listPane
          )}
        </div>
      ) : (
        /* Desktop: resizable two-pane (list + detail). */
        <ResizablePanelGroup direction="horizontal" className="flex-1">
          <ResizablePanel defaultSize={38} minSize={28} maxSize={55}>
            {listPane}
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize={62}>
            <ScrollArea className="h-full">
              <div className="px-6 py-6" data-testid="inbox-detail">
                {detailBody}
              </div>
            </ScrollArea>
          </ResizablePanel>
        </ResizablePanelGroup>
      )}
    </div>
  );
}

/* ── detail panes ────────────────────────────────────────────────────────── */

function ApprovalDetail({ item }: { item: InboxApprovalItem }) {
  const t = useTranslations("Triage");
  const tRuns = useTranslations("Runs");
  const roleKey =
    item.role === "admin"
      ? "roleAdmin"
      : item.role === "team-admin"
        ? "roleTeamAdmin"
        : "roleOwner";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-display text-base font-semibold capitalize">
          {item.variant === "local-mcp"
            ? t("localMcpTitle", { server: item.serverName ?? "" })
            : `${tRuns("title")} · ${item.runKind ?? ""}`}
        </h2>
        <Badge variant="outline" className="rounded-full text-xs">
          {t(roleKey)}
        </Badge>
        <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
          <Clock className="size-3" />
          {t("requested")}{" "}
          {formatDistanceToNow(new Date(item.requestedAt), { addSuffix: true })}
        </span>
      </div>

      <p className="rounded-xl bg-muted/50 p-4 text-sm leading-relaxed">
        {item.variant === "local-mcp"
          ? t("localMcpBody", {
              tool: item.toolName ?? "",
              server: item.serverName ?? "",
            })
          : (item.message ?? t("pendingApprovals"))}
      </p>

      {item.variant === "local-mcp" && (
        <p className="text-xs text-muted-foreground">{t("localMcpTtlNote")}</p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        <ApprovalDecisionButtons requestId={item.requestId} />
        {item.runId && (
          <Link
            href={`/runs/${item.runId}`}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            {t("openRun")}
            <ChevronRight className="size-3" />
          </Link>
        )}
      </div>
    </div>
  );
}

function RunDetail({
  item,
  statusLabel,
}: {
  item: InboxRunItem;
  statusLabel: Record<AgentSessionStatus, string>;
}) {
  const t = useTranslations("Triage");
  const tRuns = useTranslations("Runs");

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={cn("size-2.5 rounded-full", STATUS_DOT[item.status])}
        />
        <h2 className="font-display text-base font-semibold capitalize">
          {item.runKind}
        </h2>
        <Badge
          className={cn(
            "rounded-full border-transparent",
            STATUS_BADGE[item.status],
          )}
        >
          {statusLabel[item.status]}
        </Badge>
        <Badge variant="outline" className="rounded-full text-xs capitalize">
          {item.origin}
        </Badge>
      </div>

      <dl className="grid grid-cols-1 gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs text-muted-foreground">{tRuns("started")}</dt>
          <dd className="tabular-nums">
            {format(new Date(item.createdAt), "MMM d, yyyy HH:mm")}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">{tRuns("cost")}</dt>
          <dd className="tabular-nums">
            {item.cost > 0 ? `$${item.cost.toFixed(4)}` : "—"}
          </dd>
        </div>
      </dl>

      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        <code className="truncate font-mono">{item.runId}</code>
        <RunCopyButton text={item.runId} />
      </div>

      <Link
        href={`/runs/${item.runId}`}
        data-testid="inbox-open-run"
        className="inline-flex w-fit items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
      >
        {t("openRun")}
        <ChevronRight className="size-3.5" />
      </Link>
    </div>
  );
}
