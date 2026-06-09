import type { BudgetAlertItem } from "lib/admin/teams";
import { Card, CardContent, CardHeader, CardTitle } from "ui/card";

interface BudgetAlertsWidgetProps {
  alerts: BudgetAlertItem[];
}

function formatPercent(ratio: number): string {
  return `${(ratio * 100).toFixed(1)}%`;
}

function formatUsd(value: string): string {
  return `$${Number(value).toFixed(2)}`;
}

export function BudgetAlertsWidget({ alerts }: BudgetAlertsWidgetProps) {
  const alerting = alerts.filter((a) => a.alert);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          Budget Alerts
          {alerting.length > 0 && (
            <span className="inline-flex items-center rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">
              {alerting.length} at risk
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {alerts.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">
            No active budget periods found.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {alerts.map((item) => (
              <li
                key={item.teamId}
                className="flex items-center justify-between py-2 gap-4"
              >
                <div className="min-w-0 flex-1">
                  <span className="text-sm font-medium truncate">
                    {item.teamName}
                  </span>
                  <span className="ml-2 text-xs text-muted-foreground font-mono">
                    {formatUsd(item.usedUsd)} / {formatUsd(item.budgetUsd)}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <div
                    className="h-2 w-24 rounded-full bg-muted overflow-hidden"
                    aria-hidden="true"
                  >
                    <div
                      className={`h-full rounded-full transition-all ${
                        item.alert
                          ? "bg-yellow-500"
                          : "bg-green-500"
                      }`}
                      style={{
                        width: `${Math.min(item.utilizationRatio * 100, 100)}%`,
                      }}
                    />
                  </div>
                  <span
                    className={`text-sm font-mono w-14 text-right ${
                      item.alert
                        ? "text-yellow-600 dark:text-yellow-400 font-semibold"
                        : "text-muted-foreground"
                    }`}
                  >
                    {formatPercent(item.utilizationRatio)}
                  </span>
                  {item.alert && (
                    <span className="inline-flex items-center rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">
                      Warning
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
