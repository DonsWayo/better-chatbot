import { format } from "date-fns";
import { ArrowLeft } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { ApprovalDecisionButtons } from "@/components/runs/approval-decision-buttons";
import { RunCopyButton } from "@/components/runs/run-copy-button";
import { RunSessionLive } from "@/components/realtime/use-run-sessions";
import { RunRefreshPoller } from "@/components/runs/run-refresh-poller";
import { getSession } from "auth/server";
import type { ApprovalRequestedRole } from "lib/agent-platform/approvals";
import { canDecide, getApprovalForSession } from "lib/agent-platform/approvals";
import type {
  AgentSessionStatus,
  AgentStepStatus,
} from "lib/agent-platform/sessions";
import { getSessionWithSteps } from "lib/agent-platform/sessions";
import { getIsUserAdmin } from "lib/user/utils";
import { cn } from "lib/utils";
import { Badge } from "ui/badge";

const NON_TERMINAL: AgentSessionStatus[] = [
  "queued",
  "running",
  "awaiting_approval",
  "paused",
];

const STATUS_LABEL_KEY: Record<AgentSessionStatus, string> = {
  queued: "queued",
  running: "running",
  awaiting_approval: "awaitingApproval",
  paused: "paused",
  completed: "completed",
  failed: "failed",
  cancelled: "cancelled",
};

const STATUS_BADGE_CLASS: Record<AgentSessionStatus, string> = {
  queued: "bg-muted text-muted-foreground",
  running: "bg-primary/15 text-[#0E7C83] dark:text-primary",
  awaiting_approval: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  paused: "bg-muted text-muted-foreground",
  completed: "bg-green-500/15 text-green-600 dark:text-green-400",
  failed: "bg-red-500/15 text-red-600 dark:text-red-400",
  cancelled: "bg-red-500/15 text-red-600 dark:text-red-400",
};

const STEP_STATUS_CLASS: Record<AgentStepStatus, string> = {
  running: "bg-primary/15 text-[#0E7C83] dark:text-primary",
  completed: "bg-green-500/15 text-green-600 dark:text-green-400",
  failed: "bg-red-500/15 text-red-600 dark:text-red-400",
  skipped: "bg-muted text-muted-foreground",
};

// Timeline node ring colour per step status (the dot on the rail).
const STEP_NODE_CLASS: Record<AgentStepStatus, string> = {
  running: "border-primary bg-primary/20",
  completed: "border-green-500 bg-green-500/20",
  failed: "border-red-500 bg-red-500/20",
  skipped: "border-muted-foreground/40 bg-muted",
};

const SESSION_DOT_CLASS: Record<AgentSessionStatus, string> = {
  queued: "bg-muted-foreground/40",
  running: "bg-primary animate-pulse",
  awaiting_approval: "bg-amber-500",
  paused: "bg-muted-foreground/40",
  completed: "bg-green-500",
  failed: "bg-red-500",
  cancelled: "bg-red-500/60",
};

function formatDuration(start: Date | null, end: Date | null): string | null {
  if (!start || !end) return null;
  const ms = end.getTime() - start.getTime();
  if (ms < 0) return null;
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.round((ms % 60_000) / 1000);
  return `${minutes}m ${seconds}s`;
}

function JsonBlock({ label, value }: { label: string; value: unknown }) {
  return (
    <details className="group/json">
      <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground transition-colors select-none">
        {label}
      </summary>
      <pre className="mt-2 max-h-64 overflow-auto rounded-xl bg-muted/50 p-3 text-xs leading-relaxed">
        {JSON.stringify(value, null, 2)}
      </pre>
    </details>
  );
}

export default async function RunPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const authSession = await getSession();

  if (!authSession?.user?.id) {
    redirect("/sign-in");
  }

  const result = await getSessionWithSteps(id);
  if (!result) {
    notFound();
  }

  const { session, steps } = result;

  const isOwner = session.userId === authSession.user.id;
  if (!isOwner && !getIsUserAdmin(authSession.user)) {
    // Hide existence from non-owners rather than confirming it with a 403.
    notFound();
  }

  const t = await getTranslations("Runs");
  const isNonTerminal = NON_TERMINAL.includes(session.status);

  // Agent Platform #26 — when this run is parked on a pending approval the
  // current user may decide, surface Approve/Reject inline (same client
  // component as the Triage inbox).
  let pendingApprovalId: string | null = null;
  let pendingApprovalMessage: string | null = null;
  if (session.status === "awaiting_approval") {
    const request = await getApprovalForSession(session.id);
    if (request?.status === "pending") {
      const allowed = await canDecide(
        authSession.user.id,
        getIsUserAdmin(authSession.user),
        {
          requestedRole: request.requestedRole as ApprovalRequestedRole,
          sessionUserId: session.userId,
          sessionTeamId: session.teamId,
        },
      );
      if (allowed) {
        pendingApprovalId = request.id;
        const payload = request.payload as { message?: unknown } | null;
        pendingApprovalMessage =
          typeof payload?.message === "string" ? payload.message : null;
      }
    }
  }
  return (
    <div className="mx-auto w-full max-w-3xl px-4 sm:px-6 py-8">
      {/* Page-scoped realtime: Electric push + SWR poll fail-soft baseline,
          both gated on non-terminal so a completed run opens no connection. */}
      {isNonTerminal && <RunSessionLive runId={session.id} />}
      {isNonTerminal && <RunRefreshPoller runId={session.id} />}

      <Link
        href="/"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="size-3.5" />
        {t("back")}
      </Link>

      {/* Pending approval — decidable by the current user */}
      {pendingApprovalId && (
        <div
          className="mb-4 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-3 sm:p-4"
          data-testid="run-approval-panel"
        >
          <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
            {t("needsApproval")}
          </p>
          {pendingApprovalMessage && (
            <p className="mt-2 rounded-xl bg-background/60 p-3 text-sm">
              {pendingApprovalMessage}
            </p>
          )}
          <ApprovalDecisionButtons
            requestId={pendingApprovalId}
            className="mt-3"
          />
        </div>
      )}

      {/* Header */}
      <div className="rounded-2xl border bg-card p-6">
        <div className="flex flex-wrap items-center gap-2.5">
          <span
            className={cn(
              "size-2.5 shrink-0 rounded-full",
              SESSION_DOT_CLASS[session.status],
            )}
          />
          <h1 className="font-display text-lg font-semibold capitalize tracking-tight">
            {session.kind}
          </h1>
          <Badge
            className={cn(
              "rounded-full border-transparent",
              STATUS_BADGE_CLASS[session.status],
            )}
          >
            {t(STATUS_LABEL_KEY[session.status])}
          </Badge>
          <Badge variant="outline" className="rounded-full capitalize">
            {session.mode}
          </Badge>
          <Badge variant="outline" className="rounded-full capitalize">
            {session.originSurface}
          </Badge>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-x-8 gap-y-3 text-sm sm:grid-cols-3">
          <div>
            <p className="text-xs text-muted-foreground">{t("started")}</p>
            <p>
              {session.startedAt
                ? format(session.startedAt, "MMM d, yyyy HH:mm:ss")
                : "—"}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{t("ended")}</p>
            <p>
              {session.endedAt
                ? format(session.endedAt, "MMM d, yyyy HH:mm:ss")
                : "—"}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{t("cost")}</p>
            <p className="tabular-nums">
              {session.costSoFar > 0 ? `$${session.costSoFar.toFixed(4)}` : "—"}
            </p>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-1 text-xs text-muted-foreground">
          <code className="font-mono">{session.id}</code>
          <RunCopyButton text={session.id} />
        </div>

        {session.error && (
          <p className="mt-3 text-sm text-red-500">{session.error}</p>
        )}
      </div>

      {/* Steps timeline */}
      <h2 className="mt-8 mb-3 text-sm font-semibold text-muted-foreground">
        {t("steps")}
      </h2>

      {steps.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          {t("noStepsYet")}
        </div>
      ) : (
        <ol className="relative flex flex-col">
          {steps.map((step, idx) => {
            const duration = formatDuration(step.startedAt, step.endedAt);
            const status = step.status as AgentStepStatus;
            const isLast = idx === steps.length - 1;
            return (
              <li key={step.id} className="relative flex gap-4 pb-3">
                {/* Timeline rail: node + connecting line */}
                <div className="flex shrink-0 flex-col items-center">
                  <span
                    className={cn(
                      "z-10 mt-4 size-3 rounded-full border-2",
                      STEP_NODE_CLASS[status],
                    )}
                  />
                  {!isLast && (
                    <span className="w-px flex-1 bg-border" aria-hidden />
                  )}
                </div>

                <div className="min-w-0 flex-1 rounded-2xl border bg-card p-3 shadow-xs sm:p-4">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="font-mono text-xs text-muted-foreground tabular-nums">
                      #{step.stepIndex}
                    </span>
                    <span className="truncate text-sm font-medium">
                      {step.nodeId}
                    </span>
                    {step.nodeKind && (
                      <Badge variant="outline" className="rounded-full">
                        {step.nodeKind}
                      </Badge>
                    )}
                    <Badge
                      className={cn(
                        "rounded-full border-transparent",
                        STEP_STATUS_CLASS[status],
                      )}
                    >
                      {step.status}
                    </Badge>
                    {duration && (
                      <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                        {duration}
                      </span>
                    )}
                  </div>

                  {(step.input != null ||
                    step.output != null ||
                    step.error) && (
                    <div className="mt-3 flex flex-col gap-2">
                      {step.input !== null && step.input !== undefined && (
                        <JsonBlock label={t("input")} value={step.input} />
                      )}
                      {step.output !== null && step.output !== undefined && (
                        <JsonBlock label={t("output")} value={step.output} />
                      )}
                      {step.error && (
                        <p className="text-sm text-red-500">{step.error}</p>
                      )}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
