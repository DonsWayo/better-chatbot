"use client";

import { Card, CardContent, CardHeader, CardTitle } from "ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "ui/table";
import type { getUsageSummary } from "lib/admin/teams";

interface UsageTableProps {
  data: Awaited<ReturnType<typeof getUsageSummary>>;
}

function formatCostDetailed(value: string | null | undefined): string {
  if (value == null) return "$0.000000";
  return `$${Number(value).toFixed(6)}`;
}

function formatCostTotal(value: string | null | undefined): string {
  if (value == null) return "$0.00";
  return `$${Number(value).toFixed(2)}`;
}

export function UsageTable({ data }: UsageTableProps) {
  const { byModel, byTaskClass, totals, days } = data;

  return (
    <div className="space-y-6 w-full">
      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Requests
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {(totals?.totalRequests ?? 0).toLocaleString()}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Cost
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {formatCostTotal(totals?.totalCostUsd)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Period
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">Last {days} days</p>
          </CardContent>
        </Card>
      </div>

      {/* Cost by model */}
      <div className="space-y-2">
        <h3 className="text-lg font-semibold">Cost by Model</h3>
        <div className="rounded-lg border bg-card w-full overflow-x-auto">
          <Table className="w-full">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="font-semibold">Model</TableHead>
                <TableHead className="font-semibold">Provider</TableHead>
                <TableHead className="font-semibold text-right">Requests</TableHead>
                <TableHead className="font-semibold text-right">Prompt Tokens</TableHead>
                <TableHead className="font-semibold text-right">Completion Tokens</TableHead>
                <TableHead className="font-semibold text-right">Cost USD</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {byModel.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="text-center py-8 text-muted-foreground"
                  >
                    No usage data for this period.
                  </TableCell>
                </TableRow>
              ) : (
                byModel.map((row, i) => (
                  <TableRow key={`${row.model}-${row.provider}-${i}`}>
                    <TableCell className="font-medium">
                      <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                        {row.model}
                      </code>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {row.provider}
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {row.requests.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {(row.totalPromptTokens ?? 0).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {(row.totalCompletionTokens ?? 0).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right text-sm font-mono">
                      {formatCostDetailed(row.totalCostUsd)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Cost by task class */}
      <div className="space-y-2">
        <h3 className="text-lg font-semibold">Cost by Task Class</h3>
        <div className="rounded-lg border bg-card w-full overflow-x-auto">
          <Table className="w-full">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="font-semibold">Task Class</TableHead>
                <TableHead className="font-semibold text-right">Requests</TableHead>
                <TableHead className="font-semibold text-right">Cost USD</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {byTaskClass.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={3}
                    className="text-center py-8 text-muted-foreground"
                  >
                    No usage data for this period.
                  </TableCell>
                </TableRow>
              ) : (
                byTaskClass.map((row, i) => (
                  <TableRow key={`${row.taskClass ?? "unknown"}-${i}`}>
                    <TableCell className="font-medium">
                      {row.taskClass ?? (
                        <span className="text-muted-foreground italic">unclassified</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {row.requests.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right text-sm font-mono">
                      {formatCostDetailed(row.totalCostUsd)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
