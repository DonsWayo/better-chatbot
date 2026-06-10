"use client";

import type { AsafeMessageFeedbackEntity } from "lib/db/pg/schema.pg";
import { Star, ThumbsDown, ThumbsUp } from "lucide-react";
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

interface QualityDashboardProps {
  recent: AsafeMessageFeedbackEntity[];
  upCount: number;
  downCount: number;
}

export function QualityDashboard({
  recent,
  upCount,
  downCount,
}: QualityDashboardProps) {
  const total = upCount + downCount;
  const satisfactionPct =
    total > 0 ? Math.round((upCount / total) * 100) : null;

  return (
    <div className="space-y-6 p-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight flex items-center gap-2">
          <Star className="size-6" />
          Quality Monitoring
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          User feedback (👍/👎) on AI responses — Wave 9 quality tracking.
        </p>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6 text-center">
            <div className="flex items-center justify-center gap-2 mb-1">
              <ThumbsUp className="size-5 text-green-500" />
              <p className="text-3xl font-semibold tabular-nums text-green-600 dark:text-green-400">
                {upCount}
              </p>
            </div>
            <p className="text-sm text-muted-foreground">Thumbs up</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <div className="flex items-center justify-center gap-2 mb-1">
              <ThumbsDown className="size-5 text-destructive" />
              <p className="text-3xl font-semibold tabular-nums text-destructive">
                {downCount}
              </p>
            </div>
            <p className="text-sm text-muted-foreground">Thumbs down</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-3xl font-semibold tabular-nums">
              {satisfactionPct !== null ? `${satisfactionPct}%` : "—"}
            </p>
            <p className="text-sm text-muted-foreground">Satisfaction rate</p>
          </CardContent>
        </Card>
      </div>

      {/* Recent feedback */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent Feedback</CardTitle>
          <CardDescription>Last 100 ratings, newest first</CardDescription>
        </CardHeader>
        {recent.length === 0 ? (
          <CardContent className="py-8 text-center text-muted-foreground">
            No feedback recorded yet. Users can rate responses with 👍 / 👎 in
            the chat.
          </CardContent>
        ) : (
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Rating</TableHead>
                  <TableHead>Comment</TableHead>
                  <TableHead>Thread</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recent.map((fb) => (
                  <TableRow key={fb.id}>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(fb.createdAt).toLocaleString(undefined, {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </TableCell>
                    <TableCell className="font-mono text-xs max-w-28 truncate">
                      {fb.userId}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="secondary"
                        className={
                          fb.rating === "up"
                            ? "gap-1 rounded-full border-transparent bg-green-500/15 text-green-600 dark:text-green-400"
                            : "gap-1 rounded-full border-transparent bg-red-500/15 text-red-600 dark:text-red-400"
                        }
                      >
                        {fb.rating === "up" ? (
                          <ThumbsUp className="size-3" />
                        ) : (
                          <ThumbsDown className="size-3" />
                        )}
                        {fb.rating}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-64 truncate text-sm">
                      {fb.comment ?? (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-xs max-w-28 truncate text-muted-foreground">
                      {fb.threadId}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
