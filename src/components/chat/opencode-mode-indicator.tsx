"use client";

import { cn } from "@/lib/utils";
import { Terminal } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "ui/tooltip";

interface OpencodeModeIndicatorProps {
  enabled: boolean;
  onToggle: () => void;
  className?: string;
}

/**
 * Small pill that toggles between normal chat and opencode coding agent mode.
 * Visible only when the desktop opencode surface is available.
 */
export function OpencodeModeIndicator({
  enabled,
  onToggle,
  className,
}: OpencodeModeIndicatorProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onToggle}
          data-testid="opencode-mode-toggle"
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium transition-all duration-150",
            "border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            enabled
              ? "bg-primary/15 text-primary border-primary/30 hover:bg-primary/20"
              : "bg-muted/60 text-muted-foreground border-border hover:text-foreground hover:bg-muted",
            className,
          )}
          aria-pressed={enabled}
          aria-label={enabled ? "Coding mode active" : "Switch to coding mode"}
        >
          <Terminal className="size-3" />
          {enabled ? "Coding" : "Code"}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top">
        {enabled
          ? "Coding mode — opencode agent handles file edits and commands"
          : "Click to activate coding agent (opencode)"}
      </TooltipContent>
    </Tooltip>
  );
}
