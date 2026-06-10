"use client";

import type { AsafeGuardrailEventEntity } from "lib/db/pg/schema.pg";
import { ShieldAlert } from "lucide-react";
import { Badge } from "ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "ui/table";

interface GuardrailEventsTableProps {
  events: AsafeGuardrailEventEntity[];
}

type Firing = {
  type?: string;
  category?: string;
  severity?: string;
  message?: string;
};

function formatFireings(firings: unknown): Firing[] {
  if (!Array.isArray(firings)) return [];
  return firings as Firing[];
}

export function GuardrailEventsTable({ events }: GuardrailEventsTableProps) {
  const blockedCount = events.filter((e) => e.blocked).length;

  return (
    <div className="space-y-6 p-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight flex items-center gap-2">
            <ShieldAlert className="size-6" />
            Guardrail Events
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Security scan log — last 200 events. Blocked = request was rejected;
            Warned = logged only.
          </p>
        </div>
        <div className="flex gap-3">
          <div className="text-center">
            <p className="text-2xl font-semibold tabular-nums text-destructive">
              {blockedCount}
            </p>
            <p className="text-xs text-muted-foreground">Blocked</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-semibold tabular-nums">
              {events.length - blockedCount}
            </p>
            <p className="text-xs text-muted-foreground">Warned</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-semibold tabular-nums">
              {events.length}
            </p>
            <p className="text-xs text-muted-foreground">Total</p>
          </div>
        </div>
      </div>

      {events.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No guardrail events recorded yet.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent Events</CardTitle>
            <CardDescription>
              Showing up to 200 most recent guardrail firings
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Firings</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.map((event) => {
                  const firings = formatFireings(event.firings);
                  return (
                    <TableRow key={event.id}>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(event.createdAt).toLocaleString(undefined, {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                        })}
                      </TableCell>
                      <TableCell className="font-mono text-xs max-w-32 truncate">
                        {event.userId}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="secondary"
                          className={
                            event.blocked
                              ? "rounded-full border-transparent bg-red-500/15 text-red-600 dark:text-red-400"
                              : "rounded-full border-transparent bg-amber-500/15 text-amber-600 dark:text-amber-400"
                          }
                        >
                          {event.blocked ? "blocked" : "warned"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {firings.length === 0 ? (
                            <span className="text-xs text-muted-foreground">
                              —
                            </span>
                          ) : (
                            firings.map((f, i) => (
                              <Badge
                                key={i}
                                variant="outline"
                                className="text-xs"
                              >
                                {f.type ?? f.category ?? "unknown"}
                                {f.severity && (
                                  <span className="ml-1 opacity-60">
                                    {f.severity}
                                  </span>
                                )}
                              </Badge>
                            ))
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
