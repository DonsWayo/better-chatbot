import { ClipboardCheck, GitBranch, Hash, ShieldCheck } from "lucide-react";

import { cn } from "lib/utils";
import { Badge } from "ui/badge";

// Agent Platform #26 — shared card for surfacing approval-gate context to a
// human approver. Used in /runs/[id] amber panel and (optionally) the Inbox
// detail pane. Accepts the four fields that belong in the payload for a
// workflow-gate approval; local-MCP arm payloads use their own rendering.

export interface ApprovalPayloadCardProps {
  /** The human label the workflow author gave the approval gate node. */
  nodeName?: string | null;
  /** 0-based index of the step parked at this gate. */
  stepIndex?: number | null;
  /** The plain-text or markdown message to show the approver. */
  message?: string | null;
  /** The role required to approve ("owner" | "team-admin" | "admin"). */
  requestedRole?: string | null;
  /** ISO timestamp string or Date when the request was created. */
  requestedAt?: string | Date | null;
  className?: string;
}

function roleBadgeClass(role: string | null | undefined): string {
  switch (role) {
    case "admin":
      return "bg-red-500/15 text-red-600 dark:text-red-400 border-transparent";
    case "team-admin":
      return "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-transparent";
    default:
      // "owner" or unknown
      return "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-transparent";
  }
}

function formatRelative(d: string | Date | null | undefined): string | null {
  if (!d) return null;
  try {
    const date = typeof d === "string" ? new Date(d) : d;
    if (Number.isNaN(date.getTime())) return null;
    const diffMs = Date.now() - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 60) return "just now";
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDay = Math.floor(diffHr / 24);
    return `${diffDay}d ago`;
  } catch {
    return null;
  }
}

export function ApprovalPayloadCard({
  nodeName,
  stepIndex,
  message,
  requestedRole,
  requestedAt,
  className,
}: ApprovalPayloadCardProps) {
  const relativeTime = formatRelative(requestedAt);

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {/* Heading row */}
      <div className="flex flex-wrap items-center gap-2">
        <ClipboardCheck className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />
        <span className="text-sm font-semibold text-amber-700 dark:text-amber-400">
          {nodeName ? nodeName : "Approval required"}
        </span>
        {requestedRole && (
          <Badge
            className={cn("rounded-full text-[11px]", roleBadgeClass(requestedRole))}
          >
            <ShieldCheck className="mr-1 size-3" />
            {requestedRole}
          </Badge>
        )}
      </div>

      {/* Metadata chips */}
      {(stepIndex != null || relativeTime) && (
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          {stepIndex != null && (
            <span className="flex items-center gap-1">
              <Hash className="size-3" />
              Step {stepIndex}
            </span>
          )}
          {nodeName && (
            <span className="flex items-center gap-1">
              <GitBranch className="size-3" />
              Workflow gate
            </span>
          )}
          {relativeTime && (
            <span className="ml-auto tabular-nums">{relativeTime}</span>
          )}
        </div>
      )}

      {/* Message body */}
      {message && (
        <div className="rounded-xl bg-background/60 p-3 text-sm leading-relaxed whitespace-pre-wrap">
          {message}
        </div>
      )}

      {/* Fallback when there is nothing to show */}
      {!message && !nodeName && (
        <p className="text-sm text-muted-foreground">
          A workflow step requires your approval before it can continue.
        </p>
      )}
    </div>
  );
}
