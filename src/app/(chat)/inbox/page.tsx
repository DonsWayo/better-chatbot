import { format, formatDistanceToNow } from "date-fns";
import { ArrowLeft, Inbox } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { redirect } from "next/navigation";

import { ApprovalDecisionButtons } from "@/components/runs/approval-decision-buttons";
import {
  type RoutineItem,
  RoutinesList,
} from "@/components/runs/routines-list";
import { getSession } from "auth/server";
import type { ApprovalRequestedRole } from "lib/agent-platform/approvals";
import { listPendingApprovalsForUser } from "lib/agent-platform/approvals";
import { listSchedulesForUser } from "lib/agent-platform/scheduler";
import type { AgentSessionStatus } from "lib/agent-platform/sessions";
import { listSessionsForUser } from "lib/agent-platform/sessions";
import { workflowRepository } from "lib/db/repository";
import { getIsUserAdmin } from "lib/user/utils";
import { cn } from "lib/utils";
import { Badge } from "ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "ui/tabs";

// Inbox (formerly /triage — server redirect kept): pending approvals the
// caller can decide, run history, and routine management.
// Server component → direct lib calls (docs/CLAUDE.md decision matrix).

const ROUTINE_RUN_SCAN_LIMIT = 200;
const ROUTINE_RUN_DISPLAY_LIMIT = 10;
const RECENT_RUN_DISPLAY_LIMIT = 30;

const ROLE_LABEL_KEY: Record<ApprovalRequestedRole, string> = {
  owner: "roleOwner",
  "team-admin": "roleTeamAdmin",
  admin: "roleAdmin",
};

const RUN_STATUS_CLASS: Partial<Record<AgentSessionStatus, string>> = {
  running: "bg-[#FFC72C]/15 text-[#9a7b00] dark:text-[#FFC72C]",
  awaiting_approval: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  completed: "bg-green-500/15 text-green-600 dark:text-green-400",
  failed: "bg-red-500/15 text-red-600 dark:text-red-400",
  cancelled: "bg-red-500/15 text-red-600 dark:text-red-400",
};

const RUN_STATUS_LABEL_KEY: Record<AgentSessionStatus, string> = {
  queued: "queued",
  running: "running",
  awaiting_approval: "awaitingApproval",
  paused: "paused",
  completed: "completed",
  failed: "failed",
  cancelled: "cancelled",
};

/** The optional human-readable summary an approval payload may carry. */
function payloadMessage(payload: unknown): string | null {
  if (
    payload &&
    typeof payload === "object" &&
    "message" in payload &&
    typeof (payload as { message: unknown }).message === "string"
  ) {
    return (payload as { message: string }).message;
  }
  return null;
}

export default async function InboxPage() {
  const authSession = await getSession();
  if (!authSession?.user?.id) {
    redirect("/sign-in");
  }

  const userId = authSession.user.id;
  const isAdmin = getIsUserAdmin(authSession.user);

  const [t, tRuns, approvals, sessions, schedules, workflows] =
    await Promise.all([
      getTranslations("Triage"),
      getTranslations("Runs"),
      listPendingApprovalsForUser(userId, isAdmin),
      listSessionsForUser(userId, { limit: ROUTINE_RUN_SCAN_LIMIT }),
      listSchedulesForUser(userId),
      workflowRepository.selectAll(userId),
    ]);

  const routineRuns = sessions
    .filter((run) => run.originSurface === "schedule")
    .slice(0, ROUTINE_RUN_DISPLAY_LIMIT);

  // Full recent-run history: the ephemeral sidebar rail only shows live
  // runs, so completed/failed runs are found here.
  const recentRuns = sessions.slice(0, RECENT_RUN_DISPLAY_LIMIT);

  const workflowNameById = new Map(workflows.map((w) => [w.id, w.name]));

  const routines: RoutineItem[] = schedules.map((schedule) => ({
    id: schedule.id,
    workflowId: schedule.workflowId,
    workflowName: workflowNameById.get(schedule.workflowId) ?? null,
    cronExpr: schedule.cronExpr,
    timezone: schedule.timezone,
    enabled: schedule.enabled,
    nextRunAt: schedule.nextRunAt?.toISOString() ?? null,
    lastRunAt: schedule.lastRunAt?.toISOString() ?? null,
  }));

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-8">
      <Link
        href="/"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="size-3.5" />
        {tRuns("back")}
      </Link>

      <div className="mb-6 flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-2xl bg-[#FFC72C]/15">
          <Inbox className="size-5 text-[#9a7b00] dark:text-[#FFC72C]" />
        </span>
        <div>
          <h1 className="text-lg font-semibold">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
      </div>

      <Tabs defaultValue="inbox">
        <TabsList className="rounded-full">
          <TabsTrigger value="inbox" className="rounded-full">
            {t("inboxTab")}
            {approvals.length > 0 && (
              <Badge className="ml-1 rounded-full border-transparent bg-[#FFC72C] text-black tabular-nums">
                {approvals.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="runs" className="rounded-full">
            {t("runsTab")}
          </TabsTrigger>
          <TabsTrigger value="routines" className="rounded-full">
            {t("routinesTab")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="inbox" className="mt-4 flex flex-col gap-8">
          {/* Pending approvals */}
          <section>
            <h2 className="mb-3 text-sm font-semibold text-muted-foreground">
              {t("pendingApprovals")}
            </h2>
            {approvals.length === 0 ? (
              <div className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">
                {t("emptyApprovals")}
              </div>
            ) : (
              <ul className="flex flex-col gap-3">
                {approvals.map(({ request, session }) => {
                  const message = payloadMessage(request.payload);
                  return (
                    <li
                      key={request.id}
                      className="rounded-2xl border bg-card p-4 shadow-xs"
                      data-testid="triage-approval-card"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={`/runs/${session.id}`}
                          className="text-sm font-medium hover:underline"
                        >
                          {tRuns("title")} · {session.kind}
                        </Link>
                        <Badge
                          variant="outline"
                          className="rounded-full text-xs"
                        >
                          {t(
                            ROLE_LABEL_KEY[
                              request.requestedRole as ApprovalRequestedRole
                            ] ?? "roleTeamAdmin",
                          )}
                        </Badge>
                        <span className="ml-auto text-xs text-muted-foreground">
                          {t("requested")}{" "}
                          {formatDistanceToNow(request.requestedAt, {
                            addSuffix: true,
                          })}
                        </span>
                      </div>
                      {message && (
                        <p className="mt-2 rounded-xl bg-muted/50 p-3 text-sm">
                          {message}
                        </p>
                      )}
                      <div className="mt-3 flex items-end justify-between gap-3">
                        <ApprovalDecisionButtons requestId={request.id} />
                        <Link
                          href={`/runs/${session.id}`}
                          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                        >
                          {t("viewRun")} →
                        </Link>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* Recent routine runs */}
          <section>
            <h2 className="mb-3 text-sm font-semibold text-muted-foreground">
              {t("recentRoutineRuns")}
            </h2>
            {routineRuns.length === 0 ? (
              <div className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">
                {t("emptyRoutineRuns")}
              </div>
            ) : (
              <ul className="flex flex-col gap-2">
                {routineRuns.map((run) => (
                  <li key={run.id}>
                    <Link
                      href={`/runs/${run.id}`}
                      className="flex items-center gap-3 rounded-2xl border bg-card px-4 py-3 shadow-xs transition-colors hover:bg-muted/40"
                      data-testid="triage-routine-run"
                    >
                      <Badge
                        className={cn(
                          "rounded-full border-transparent",
                          RUN_STATUS_CLASS[run.status] ??
                            "bg-muted text-muted-foreground",
                        )}
                      >
                        {tRuns(RUN_STATUS_LABEL_KEY[run.status])}
                      </Badge>
                      <span className="truncate text-sm capitalize">
                        {run.kind}
                      </span>
                      <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                        {format(run.createdAt, "MMM d, HH:mm")}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </TabsContent>

        {/* Recent runs — full history (the sidebar rail is live-only) */}
        <TabsContent value="runs" className="mt-4">
          {recentRuns.length === 0 ? (
            <div className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">
              {t("emptyRuns")}
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              {recentRuns.map((run) => (
                <li key={run.id}>
                  <Link
                    href={`/runs/${run.id}`}
                    className="flex items-center gap-3 rounded-2xl border bg-card px-4 py-3 shadow-xs transition-colors hover:bg-muted/40"
                    data-testid="inbox-recent-run"
                  >
                    <Badge
                      className={cn(
                        "rounded-full border-transparent",
                        RUN_STATUS_CLASS[run.status] ??
                          "bg-muted text-muted-foreground",
                      )}
                    >
                      {tRuns(RUN_STATUS_LABEL_KEY[run.status])}
                    </Badge>
                    <span className="truncate text-sm capitalize">
                      {run.kind}
                    </span>
                    {run.costSoFar > 0 && (
                      <span className="text-xs text-muted-foreground tabular-nums">
                        ${run.costSoFar.toFixed(4)}
                      </span>
                    )}
                    <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                      {format(run.createdAt, "MMM d, HH:mm")}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="routines" className="mt-4">
          <RoutinesList routines={routines} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
