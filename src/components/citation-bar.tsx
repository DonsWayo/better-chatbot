"use client";

import { memo } from "react";
import { BookOpen } from "lucide-react";
import { Badge } from "ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "ui/tooltip";

const SOURCE_PATTERN = /\[Source (\d+):\s*([^\]]+)\]/g;

interface Citation {
  num: number;
  source: string;
}

function extractCitations(text: string): Citation[] {
  const seen = new Set<number>();
  const citations: Citation[] = [];
  for (const match of text.matchAll(SOURCE_PATTERN)) {
    const num = parseInt(match[1], 10);
    if (!seen.has(num)) {
      seen.add(num);
      citations.push({ num, source: match[2].trim() });
    }
  }
  citations.sort((a, b) => a.num - b.num);
  return citations;
}

interface CitationBarProps {
  text: string;
}

export const CitationBar = memo(function CitationBar({ text }: CitationBarProps) {
  const citations = extractCitations(text);
  if (citations.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-muted">
      <span className="flex items-center gap-1 text-xs text-muted-foreground mr-0.5">
        <BookOpen className="h-3 w-3" />
        Sources:
      </span>
      {citations.map(({ num, source }) => (
        <Tooltip key={num}>
          <TooltipTrigger asChild>
            <Badge
              variant="secondary"
              className="text-xs cursor-default font-normal max-w-[180px]"
            >
              <span className="font-semibold mr-1">{num}</span>
              <span className="truncate">{source}</span>
            </Badge>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-xs break-all">
            {source}
          </TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
});
