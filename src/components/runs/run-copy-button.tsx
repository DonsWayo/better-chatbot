"use client";

import { Check, Copy } from "lucide-react";

import { useCopy } from "@/hooks/use-copy";
import { Button } from "ui/button";

export function RunCopyButton({ text }: { text: string }) {
  const { copied, copy } = useCopy();
  return (
    <Button
      variant="ghost"
      size="icon"
      className="size-6"
      onClick={() => copy(text)}
    >
      {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
    </Button>
  );
}
