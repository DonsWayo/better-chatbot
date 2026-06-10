import type { DashboardStats } from "lib/admin/dashboard";
import type { BudgetAlertItem } from "lib/admin/teams";
import {
  AlertTriangle,
  Building2,
  DollarSign,
  MessageSquare,
  ShieldAlert,
  Users,
} from "lucide-react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "ui/card";
import { BudgetAlertsWidget } from "./budget-alerts-widget";

interface StatCardProps {
  title: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  href?: string;
  warning?: boolean;
  mono?: boolean;
}

function StatCard({
  title,
  value,
  sub,
  icon,
  href,
  warning,
  mono,
}: StatCardProps) {
  const inner = (
    <Card
      className={
        href
          ? "h-full transition-all duration-150 ease-[cubic-bezier(0.2,0.9,0.3,1.2)] hover:bg-muted/40 active:scale-[0.98]"
          : "h-full"
      }
    >
      <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        {warning ? (
          <span className="flex items-center justify-center rounded-full bg-amber-500/15 p-1.5 text-amber-600 dark:text-amber-400">
            {icon}
          </span>
        ) : (
          <div className="text-muted-foreground">{icon}</div>
        )}
      </CardHeader>
      <CardContent>
        <p
          className={`text-2xl font-semibold tabular-nums ${mono ? "font-mono" : ""}`}
        >
          {value}
        </p>
        {sub && (
          <p className="text-xs text-muted-foreground mt-1 tabular-nums">
            {sub}
          </p>
        )}
      </CardContent>
    </Card>
  );
  if (href) return <Link href={href}>{inner}</Link>;
  return inner;
}

interface AdminDashboardProps {
  stats: DashboardStats;
  budgetAlerts: BudgetAlertItem[];
}

export function AdminDashboard({ stats, budgetAlerts }: AdminDashboardProps) {
  return (
    <div className="space-y-6 p-6">
      <div className="animate-in fade-in slide-in-from-bottom-2 fill-mode-backwards duration-500">
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          Overview
        </h1>
        <p className="text-sm text-muted-foreground">
          Platform health at a glance.
        </p>
      </div>

      {/* KPI grid */}
      <div
        className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-3 gap-4 animate-in fade-in slide-in-from-bottom-2 fill-mode-backwards duration-500"
        style={{ animationDelay: "40ms" }}
        data-testid="admin-kpi-grid"
      >
        <StatCard
          title="Total Users"
          value={stats.totalUsers.toLocaleString()}
          icon={<Users className="h-4 w-4" />}
          href="/admin/users"
        />
        <StatCard
          title="Total Teams"
          value={stats.totalTeams.toLocaleString()}
          icon={<Building2 className="h-4 w-4" />}
          href="/admin/teams"
        />
        <StatCard
          title="Requests (24h)"
          value={stats.requestsLast24h.toLocaleString()}
          sub={`${stats.requestsLast7d.toLocaleString()} in 7d`}
          icon={<MessageSquare className="h-4 w-4" />}
          href="/admin/usage"
        />
        <StatCard
          title="Cost (24h)"
          value={`$${stats.costLast24hUsd.toFixed(2)}`}
          sub={`$${stats.costLast7dUsd.toFixed(2)} in 7d`}
          icon={<DollarSign className="h-4 w-4" />}
          href="/admin/usage"
          mono
        />
        <StatCard
          title="Guardrail Firings (24h)"
          value={stats.guardrailFiringsLast24h.toLocaleString()}
          icon={<ShieldAlert className="h-4 w-4" />}
          href="/admin/guardrails"
          warning={stats.guardrailFiringsLast24h > 0}
        />
        <StatCard
          title="Budgets Near Limit"
          value={stats.budgetsNearLimit.toLocaleString()}
          sub="≥ 80% utilized"
          icon={<AlertTriangle className="h-4 w-4" />}
          href="/admin/usage"
          warning={stats.budgetsNearLimit > 0}
        />
      </div>

      {/* Quick links */}
      <div
        className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm animate-in fade-in slide-in-from-bottom-2 fill-mode-backwards duration-500"
        style={{ animationDelay: "80ms" }}
      >
        {[
          { label: "Users", href: "/admin/users" },
          { label: "Teams", href: "/admin/teams" },
          { label: "Usage", href: "/admin/usage" },
          { label: "Guardrails", href: "/admin/guardrails" },
          { label: "Audit Log", href: "/admin/audit" },
          { label: "Knowledge", href: "/admin/knowledge" },
          { label: "MCP Servers", href: "/admin/mcp" },
          { label: "Feature Flags", href: "/admin/feature-flags" },
        ].map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="rounded-xl border px-3 py-2 text-center font-medium transition-all duration-150 ease-[cubic-bezier(0.2,0.9,0.3,1.2)] hover:bg-muted active:scale-[0.98]"
          >
            {l.label}
          </Link>
        ))}
      </div>

      {/* Budget alerts */}
      {budgetAlerts.length > 0 && (
        <div
          className="animate-in fade-in slide-in-from-bottom-2 fill-mode-backwards duration-500"
          style={{ animationDelay: "120ms" }}
        >
          <BudgetAlertsWidget alerts={budgetAlerts} />
        </div>
      )}
    </div>
  );
}
