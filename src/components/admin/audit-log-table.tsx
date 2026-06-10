"use client";

import { format } from "date-fns";
import type { AuditLogRow } from "lib/admin/audit";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import { Badge } from "ui/badge";
import { Button } from "ui/button";
import { Input } from "ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "ui/table";

// Calm Industrial: status pills are tinted (10–15% alpha bg), never filled washes.
const EVENT_TYPE_BADGE_CLASS: Record<string, string> = {
  chat_request: "",
  rag_retrieval: "border-transparent bg-secondary text-secondary-foreground",
  tool_call: "border-transparent bg-secondary text-secondary-foreground",
  guardrail_firing:
    "border-transparent bg-red-500/15 text-red-600 dark:text-red-400",
  admin_action:
    "border-transparent bg-amber-500/15 text-amber-600 dark:text-amber-400",
  user_erasure:
    "border-transparent bg-red-500/15 text-red-600 dark:text-red-400",
  aup_accepted: "",
};

interface AuditLogTableProps {
  rows: AuditLogRow[];
  total: number;
  page: number;
  limit: number;
  eventTypes: string[];
  filters: {
    eventType?: string;
    userId?: string;
    from?: string;
    to?: string;
  };
}

export function AuditLogTable({
  rows,
  total,
  page,
  limit,
  eventTypes,
  filters,
}: AuditLogTableProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const totalPages = Math.max(1, Math.ceil(total / limit));

  const navigate = useCallback(
    (updates: Record<string, string | undefined>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [k, v] of Object.entries(updates)) {
        if (v) params.set(k, v);
        else params.delete(k);
      }
      params.set("page", "1");
      router.push(`${pathname}?${params.toString()}`);
    },
    [router, pathname, searchParams],
  );

  const goToPage = (p: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(p));
    router.push(`${pathname}?${params.toString()}`);
  };

  return (
    <div className="space-y-4 w-full">
      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Event type
          </label>
          <Select
            value={filters.eventType ?? "__all__"}
            onValueChange={(v) =>
              navigate({ eventType: v === "__all__" ? undefined : v })
            }
          >
            <SelectTrigger
              className="w-44"
              data-testid="audit-event-type-filter"
            >
              <SelectValue placeholder="All events" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All events</SelectItem>
              {eventTypes.map((t) => (
                <SelectItem key={t} value={t}>
                  {t.replace(/_/g, " ")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            User ID / email
          </label>
          <Input
            placeholder="Search user…"
            defaultValue={filters.userId ?? ""}
            className="w-48"
            data-testid="audit-user-filter"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                navigate({ userId: e.currentTarget.value || undefined });
              }
            }}
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            From
          </label>
          <Input
            type="date"
            defaultValue={filters.from ?? ""}
            className="w-40"
            onChange={(e) => navigate({ from: e.target.value || undefined })}
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            To
          </label>
          <Input
            type="date"
            defaultValue={filters.to ?? ""}
            className="w-40"
            onChange={(e) => navigate({ to: e.target.value || undefined })}
          />
        </div>
      </div>

      {/* Table */}
      <div className="rounded-lg border bg-card w-full overflow-x-auto">
        <Table className="w-full" data-testid="audit-log-table">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="font-semibold">Time</TableHead>
              <TableHead className="font-semibold">Event</TableHead>
              <TableHead className="font-semibold">User</TableHead>
              <TableHead className="font-semibold">Team</TableHead>
              <TableHead className="font-semibold">Details</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="text-center py-10 text-muted-foreground"
                >
                  No audit events found.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {format(new Date(row.createdAt), "MMM d, yyyy HH:mm:ss")}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={`text-xs font-mono rounded-full ${EVENT_TYPE_BADGE_CLASS[row.eventType] ?? ""}`}
                    >
                      {row.eventType}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm">
                    <div className="space-y-0.5">
                      {row.userEmail && (
                        <div className="font-medium text-xs">
                          {row.userEmail}
                        </div>
                      )}
                      <code className="text-xs text-muted-foreground">
                        {row.userId}
                      </code>
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {row.teamId ? (
                      <code className="text-xs">{row.teamId}</code>
                    ) : (
                      <span className="italic">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs max-w-xs truncate">
                    <code className="text-xs text-muted-foreground">
                      {typeof row.details === "object"
                        ? JSON.stringify(row.details)
                        : String(row.details ?? "")}
                    </code>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          {total === 0
            ? "No events"
            : `${(page - 1) * limit + 1}–${Math.min(page * limit, total)} of ${total.toLocaleString()} events`}
        </span>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            disabled={page <= 1}
            onClick={() => goToPage(page - 1)}
            aria-label="Previous page"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="tabular-nums">
            {page} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            disabled={page >= totalPages}
            onClick={() => goToPage(page + 1)}
            aria-label="Next page"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
