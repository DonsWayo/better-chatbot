"use client";

import type { RagSource } from "app-types/chat";
import { cn } from "lib/utils";
import { BookOpen, ChevronDown } from "lucide-react";
import Link from "next/link";
import { memo, useState } from "react";

interface RagSourcesRowProps {
  sources: RagSource[];
}

/**
 * Compact "Sources" row under assistant messages that used RAG (Wave 6
 * phase 2). Numbering matches the [Source N] citations in the message text.
 * Calm Industrial: tinted pills, no heavy chrome, soft radii.
 */
export const RagSourcesRow = memo(function RagSourcesRow({
  sources,
}: RagSourcesRowProps) {
  const [open, setOpen] = useState(false);
  if (sources.length === 0) return null;

  return (
    <div className="mt-3 pt-3 border-t border-muted">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <BookOpen className="size-3" />
        <span>
          {sources.length} {sources.length === 1 ? "source" : "sources"}
        </span>
        <ChevronDown
          className={cn(
            "size-3 transition-transform duration-150",
            open && "rotate-180",
          )}
        />
      </button>
      {open && (
        <ul className="mt-2 flex flex-col gap-1.5">
          {sources.map((source) => {
            const inner = (
              <>
                <span className="shrink-0 size-4 rounded-full bg-secondary text-secondary-foreground flex items-center justify-center text-[10px] font-medium">
                  {source.index}
                </span>
                <span className="truncate min-w-0" title={source.sourceRef}>
                  {source.sourceRef}
                </span>
                <span className="ml-auto shrink-0 rounded-full bg-secondary px-2 py-0.5 text-[10px] text-muted-foreground max-w-[10rem] truncate">
                  {source.collectionName}
                </span>
              </>
            );
            const pillClass =
              "flex items-center gap-2 rounded-2xl bg-secondary/40 px-3 py-1.5 text-xs";
            return (
              <li key={`${source.collectionId}-${source.index}`}>
                {source.collectionId ? (
                  <Link
                    href={`/studio/knowledge/${source.collectionId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={cn(
                      pillClass,
                      "hover:bg-secondary/70 transition-colors",
                    )}
                  >
                    {inner}
                  </Link>
                ) : (
                  <div className={pillClass}>{inner}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
});
