"use client";

import { useTranslations } from "next-intl";

import { cn } from "lib/utils";

// Agent Platform #24/#26 — cost preview pill ("~$0.02 · charged to Design
// budget"). Shown before scheduling a routine so the user knows which team
// budget pays for the run (docs/design/agent-platform.md "Budgets").

export interface CostPreviewProps {
  /** Estimated cost in USD; omitted → the amount segment is hidden. */
  estimatedUsd?: number;
  /** Human label of the budget that pays ("Design", "personal", …). */
  budgetLabel: string;
  className?: string;
}

/**
 * Pure formatting helper (exported for headless tests): rounds to cents,
 * floors tiny-but-nonzero estimates at "<$0.01", and returns null when no
 * estimate is available so the pill can omit the amount gracefully.
 */
export function formatEstimatedUsd(
  estimatedUsd: number | undefined,
): string | null {
  if (estimatedUsd === undefined || !Number.isFinite(estimatedUsd)) {
    return null;
  }
  if (estimatedUsd > 0 && estimatedUsd < 0.005) return "<$0.01";
  return `~$${estimatedUsd.toFixed(2)}`;
}

export function CostPreview({
  estimatedUsd,
  budgetLabel,
  className,
}: CostPreviewProps) {
  const t = useTranslations("Runs");
  const amount = formatEstimatedUsd(estimatedUsd);

  return (
    <span
      data-testid="cost-preview"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-xs text-[#0E7C83] dark:text-primary",
        className,
      )}
    >
      {amount && (
        <>
          <span className="font-medium tabular-nums">{amount}</span>
          <span aria-hidden className="opacity-60">
            ·
          </span>
        </>
      )}
      <span>{t("chargedToBudget", { budget: budgetLabel })}</span>
    </span>
  );
}
