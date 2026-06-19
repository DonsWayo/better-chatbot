import { redirect } from "next/navigation";

import {
  type InboxApprovalItem,
  type InboxMentionItem,
  type InboxRunItem,
  InboxView,
} from "@/components/inbox/inbox-view";
import type { RoutineItem } from "@/components/runs/routines-list";
import { getSession } from "auth/server";
import {
  isLocalMcpArmPayload,
  listPendingApprovalsForUser,
} from "lib/agent-platform/approvals";
import { listSchedulesForUser } from "lib/agent-platform/scheduler";
import { listSessionsForUser } from "lib/agent-platform/sessions";
import { mentionNotificationRepository, workflowRepository } from "lib/db/repository";
import { getIsUserAdmin } from "lib/user/utils";

// Inbox (formerly /triage — server redirect kept): a real two-pane mail-style
// triage surface — pending approvals the caller can decide, run history, and
// routine management. Server component loads + serializes; InboxView renders.

const ROUTINE_RUN_SCAN_LIMIT = 200;
const RECENT_RUN_DISPLAY_LIMIT = 40;

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

  const [approvalsRaw, sessions, schedules, workflows, mentionsRaw] =
    await Promise.all([
      listPendingApprovalsForUser(userId, isAdmin),
      listSessionsForUser(userId, { limit: ROUTINE_RUN_SCAN_LIMIT }),
      listSchedulesForUser(userId),
      workflowRepository.selectAll(userId),
      mentionNotificationRepository.getUnreadForUser(userId),
    ]);

  const approvals: InboxApprovalItem[] = approvalsRaw.map(
    ({ request, session }) => {
      const local = isLocalMcpArmPayload(request.payload)
        ? request.payload
        : null;
      return {
        id: `approval-${request.id}`,
        kind: "approval",
        variant: local ? "local-mcp" : "run",
        requestId: request.id,
        runId: local ? null : session.id,
        runKind: session.kind ?? null,
        role: request.requestedRole,
        message: payloadMessage(request.payload),
        serverName: local?.serverName ?? null,
        toolName: local?.toolName ?? null,
        requestedAt: request.requestedAt.toISOString(),
      };
    },
  );

  const runs: InboxRunItem[] = sessions
    .slice(0, RECENT_RUN_DISPLAY_LIMIT)
    .map((run) => ({
      id: `run-${run.id}`,
      kind: "run",
      runId: run.id,
      runKind: run.kind,
      status: run.status,
      cost: run.costSoFar,
      createdAt: run.createdAt.toISOString(),
      origin: run.originSurface,
      isRoutine: run.originSurface === "schedule",
    }));

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

  const mentions: InboxMentionItem[] = mentionsRaw.map((m) => ({
    id: m.id,
    kind: "mention",
    authorName: m.authorName,
    authorImage: m.authorImage,
    documentId: m.documentId,
    documentTitle: m.documentTitle,
    commentId: m.commentId,
    createdAt: m.createdAt.toISOString(),
  }));

  return (
    <div className="h-full">
      <InboxView
        approvals={approvals}
        runs={runs}
        routines={routines}
        mentions={mentions}
      />
    </div>
  );
}
