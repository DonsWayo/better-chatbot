import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "lib/utils";

/**
 * Shared empty-state placeholder. Replaces the ad-hoc "dashed box with grey
 * text" empties scattered across the app with one polished, branded surface:
 * a tinted icon chip, a display-font title, a muted description, and an
 * optional call-to-action. Keep copy short; lead the user to the next step.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
  compact = false,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  /** A CTA — usually a <Button> (optionally wrapped in a Link). */
  action?: ReactNode;
  className?: string;
  /** Tighter padding for inline/sidebar empties. */
  compact?: boolean;
}) {
  return (
    <div
      data-testid="empty-state"
      className={cn(
        "flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/70 text-center",
        compact ? "gap-2 px-4 py-8" : "gap-3 px-6 py-14",
        className,
      )}
    >
      {Icon && (
        <span
          className={cn(
            "flex items-center justify-center rounded-2xl bg-primary/10 text-[#0E7C83] dark:text-primary",
            compact ? "size-9" : "size-12",
          )}
        >
          <Icon className={compact ? "size-4" : "size-5"} />
        </span>
      )}
      <div className="flex flex-col gap-1">
        <p
          className={cn(
            "font-display font-semibold tracking-tight text-foreground",
            compact ? "text-sm" : "text-base",
          )}
        >
          {title}
        </p>
        {description && (
          <p className="mx-auto max-w-sm text-xs leading-relaxed text-muted-foreground sm:text-sm">
            {description}
          </p>
        )}
      </div>
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
