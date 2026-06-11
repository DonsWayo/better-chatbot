"use client";

import { cn } from "lib/utils";
import { ChevronDown, Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "ui/select";

// Shared building blocks for the "Team overrides" sections on the org-policy
// cards (memory-policy-card.tsx, local-mcp-policy-card.tsx). A team override
// is tri-state: inherit (key absent/null) / force on / force off — the
// layered resolvers in lib/memory/policy.ts and lib/ai/mcp/local-policy.ts
// let a set team value win over the org base.

export interface TeamOption {
  id: string;
  name: string;
}

/** `null` = inherit (no stored override), boolean = forced value. */
export type TriState = boolean | null;

export interface TriStateLabels {
  inherit: string;
  on: string;
  off: string;
}

function triStateToValue(state: TriState): "inherit" | "on" | "off" {
  return state === null ? "inherit" : state ? "on" : "off";
}

function valueToTriState(value: string): TriState {
  return value === "inherit" ? null : value === "on";
}

/** Compact tinted tri-state select (inherit / force on / force off). */
export function TriStateSelect({
  value,
  onChange,
  disabled,
  labels,
  ariaLabel,
  testId,
}: {
  value: TriState;
  onChange: (next: TriState) => void;
  disabled?: boolean;
  labels: TriStateLabels;
  ariaLabel?: string;
  testId?: string;
}) {
  return (
    <Select
      value={triStateToValue(value)}
      onValueChange={(v) => onChange(valueToTriState(v))}
      disabled={disabled}
    >
      <SelectTrigger
        aria-label={ariaLabel}
        data-testid={testId}
        className={cn(
          "h-7 w-auto min-w-24 gap-1 rounded-full px-3 text-xs border-transparent",
          value === null && "bg-secondary text-muted-foreground",
          value === true &&
            "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
          value === false && "bg-destructive/10 text-destructive",
        )}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="inherit">{labels.inherit}</SelectItem>
        <SelectItem value="on">{labels.on}</SelectItem>
        <SelectItem value="off">{labels.off}</SelectItem>
      </SelectContent>
    </Select>
  );
}

/**
 * Single-select team combobox (Popover + Command, the company-mcp-table
 * pattern) for adding an override row. Teams already listed are excluded.
 */
export function TeamOverrideCombobox({
  teams,
  excludeIds,
  onSelect,
  disabled,
  placeholder,
  searchPlaceholder,
  emptyText,
  testId,
}: {
  teams: TeamOption[];
  excludeIds: string[];
  onSelect: (teamId: string) => void;
  disabled?: boolean;
  placeholder: string;
  searchPlaceholder: string;
  emptyText: string;
  testId?: string;
}) {
  const [open, setOpen] = useState(false);
  const available = teams.filter((team) => !excludeIds.includes(team.id));

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          role="combobox"
          aria-expanded={open}
          disabled={disabled || available.length === 0}
          className="justify-between font-normal text-muted-foreground"
          data-testid={testId}
        >
          <span className="flex items-center gap-1.5">
            <Plus className="size-3.5 shrink-0" />
            {placeholder}
          </span>
          <ChevronDown className="size-3.5 shrink-0 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {available.map((team) => (
                <CommandItem
                  key={team.id}
                  value={team.name}
                  onSelect={() => {
                    onSelect(team.id);
                    setOpen(false);
                  }}
                >
                  <span className="truncate">{team.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
