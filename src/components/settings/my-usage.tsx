"use client";

import { Coins, MessageSquare, Wallet, Zap } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge } from "ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "ui/card";

interface UsageByModel {
  model: string;
  provider: string;
  costUsd: string;
  promptTokens: number;
  completionTokens: number;
  requestCount: number;
}

interface UsageBudget {
  budgetUsd: string;
  usedUsd: string;
  pct: number;
  periodStart: string;
  periodEnd: string;
}

interface UsageData {
  summary: {
    totalCostUsd: string;
    promptTokens: number;
    completionTokens: number;
    requestCount: number;
  };
  byModel: UsageByModel[];
  budget: UsageBudget | null;
}

function fmtCost(usd: string | number) {
  const n = typeof usd === "string" ? parseFloat(usd) : usd;
  if (n < 0.01) return "< $0.01";
  return `$${n.toFixed(2)}`;
}

function fmtTokens(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

export function MyUsageSection() {
  const [data, setData] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/user/usage")
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="animate-pulse space-y-3">
        <div className="h-4 bg-muted rounded w-1/3" />
        <div className="h-20 bg-muted rounded" />
      </div>
    );
  }

  if (!data) return null;

  const { summary, byModel, budget } = data;
  const totalTokens = summary.promptTokens + summary.completionTokens;
  const budgetPct = budget ? Math.min(budget.pct, 100) : 0;
  const budgetColor =
    budgetPct >= 90
      ? "text-destructive"
      : budgetPct >= 70
        ? "text-amber-500 dark:text-amber-400"
        : "text-green-600 dark:text-green-400";

  return (
    <section data-testid="my-usage-section">
      <h2 className="font-medium mb-3">Usage (last 30 days)</h2>

      {/* Summary row */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <Coins className="size-4 mx-auto mb-1 text-muted-foreground" />
            <p className="text-xl font-semibold">
              {fmtCost(summary.totalCostUsd)}
            </p>
            <p className="text-xs text-muted-foreground">Cost</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <Zap className="size-4 mx-auto mb-1 text-muted-foreground" />
            <p className="text-xl font-semibold">{fmtTokens(totalTokens)}</p>
            <p className="text-xs text-muted-foreground">Tokens</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <MessageSquare className="size-4 mx-auto mb-1 text-muted-foreground" />
            <p className="text-xl font-semibold">{summary.requestCount}</p>
            <p className="text-xs text-muted-foreground">Requests</p>
          </CardContent>
        </Card>
      </div>

      {/* Team budget */}
      {budget && (
        <Card className="mb-4">
          <CardHeader className="pb-2 pt-4">
            <CardTitle className="text-sm flex items-center gap-2">
              <Wallet className="size-4" />
              Team Budget
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-4">
            <div className="flex justify-between text-sm mb-1">
              <span className={budgetColor + " font-medium"}>
                {budget.pct}% used
              </span>
              <span className="text-muted-foreground">
                {fmtCost(budget.usedUsd)} / {fmtCost(budget.budgetUsd)}
              </span>
            </div>
            <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
              <div
                className="h-2 rounded-full bg-primary transition-all"
                style={{ width: `${budgetPct}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Period:{" "}
              {new Date(budget.periodStart).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
              })}
              {" – "}
              {new Date(budget.periodEnd).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Per-model breakdown */}
      {byModel.length > 0 && (
        <Card>
          <CardHeader className="pb-2 pt-4">
            <CardTitle className="text-sm">By model</CardTitle>
          </CardHeader>
          <CardContent className="pb-4">
            <div className="space-y-2">
              {byModel.map((row) => (
                <div
                  key={`${row.provider}/${row.model}`}
                  className="flex items-center justify-between text-sm"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Badge variant="outline" className="text-xs shrink-0">
                      {row.model}
                    </Badge>
                    <span className="text-muted-foreground text-xs truncate">
                      {fmtTokens(row.promptTokens + row.completionTokens)}{" "}
                      tokens · {row.requestCount} req
                    </span>
                  </div>
                  <span className="font-medium shrink-0">
                    {fmtCost(row.costUsd)}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {byModel.length === 0 && summary.requestCount === 0 && (
        <p className="text-sm text-muted-foreground">
          No activity in the last 30 days.
        </p>
      )}
    </section>
  );
}
