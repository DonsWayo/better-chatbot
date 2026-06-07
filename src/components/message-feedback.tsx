"use client";
import { ThumbsUp, ThumbsDown } from "lucide-react";
import { useState } from "react";
import { Button } from "ui/button";

interface MessageFeedbackProps {
  messageId: string;
  threadId: string;
  initialRating?: "up" | "down" | null;
}

export function MessageFeedback({ messageId, threadId, initialRating = null }: MessageFeedbackProps) {
  const [rating, setRating] = useState<"up" | "down" | null>(initialRating);
  const [pending, setPending] = useState(false);

  async function vote(newRating: "up" | "down") {
    if (pending) return;
    setPending(true);
    try {
      if (rating === newRating) {
        // Toggle off
        await fetch("/api/feedback?" + new URLSearchParams({ messageId }), { method: "DELETE" });
        setRating(null);
      } else {
        await fetch("/api/feedback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messageId, threadId, rating: newRating }),
        });
        setRating(newRating);
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
      <Button
        variant="ghost"
        size="icon"
        className={`h-6 w-6 ${rating === "up" ? "text-green-500" : "text-muted-foreground"}`}
        onClick={() => vote("up")}
        disabled={pending}
        aria-label="Helpful"
      >
        <ThumbsUp className="h-3.5 w-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className={`h-6 w-6 ${rating === "down" ? "text-red-500" : "text-muted-foreground"}`}
        onClick={() => vote("down")}
        disabled={pending}
        aria-label="Not helpful"
      >
        <ThumbsDown className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
