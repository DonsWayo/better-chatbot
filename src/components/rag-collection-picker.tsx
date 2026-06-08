"use client";

import { useKnowledgeCollections } from "@/hooks/use-knowledge-collections";
import { cn } from "lib/utils";
import { BookOpen, CheckIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "ui/button";
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from "ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "ui/tooltip";

interface RagCollectionPickerProps {
  value: string | undefined;
  onChange: (id: string | undefined) => void;
  disabled?: boolean;
}

export function RagCollectionPicker({ value, onChange, disabled }: RagCollectionPickerProps) {
  const [open, setOpen] = useState(false);
  const { collections, isLoading } = useKnowledgeCollections();

  const selected = collections.find((c) => c.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              disabled={disabled}
              className={cn(
                "rounded-full hover:bg-input! p-2! gap-1",
                value && "text-primary",
                open && "bg-input!",
              )}
              aria-label="Knowledge base"
            >
              <BookOpen className="size-3.5" />
              {selected && (
                <span className="text-xs max-w-[6rem] truncate">{selected.name}</span>
              )}
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>
          {selected ? `Knowledge: ${selected.name}` : "Knowledge base"}
        </TooltipContent>
      </Tooltip>

      <PopoverContent className="p-0 w-[260px]" align="start" side="top">
        <Command>
          <CommandList className="p-1">
            {isLoading && (
              <div className="py-3 text-center text-xs text-muted-foreground">
                Loading…
              </div>
            )}
            {!isLoading && (
              <CommandEmpty>No collections found.</CommandEmpty>
            )}
            <CommandGroup>
              <CommandItem
                className="cursor-pointer"
                onSelect={() => {
                  onChange(undefined);
                  setOpen(false);
                }}
                value="__none__"
              >
                {value === undefined ? (
                  <CheckIcon className="size-3" />
                ) : (
                  <div className="ml-3" />
                )}
                <span className="text-muted-foreground">No knowledge base</span>
              </CommandItem>

              {collections.map((col) => (
                <CommandItem
                  key={col.id}
                  className="cursor-pointer"
                  onSelect={() => {
                    onChange(col.id);
                    setOpen(false);
                  }}
                  value={col.id}
                >
                  {value === col.id ? (
                    <CheckIcon className="size-3" />
                  ) : (
                    <div className="ml-3" />
                  )}
                  <div className="flex flex-col min-w-0">
                    <span className="truncate">{col.name}</span>
                    {col.description && (
                      <span className="text-xs text-muted-foreground truncate">
                        {col.description}
                      </span>
                    )}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
