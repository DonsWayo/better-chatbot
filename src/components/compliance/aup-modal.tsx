"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useEffect, useState } from "react";
import { toast } from "sonner";

/**
 * Acceptable-Use Policy modal (EU AI Act Article 50 transparency + GDPR).
 *
 * Shown once per user on first login. User must explicitly accept before
 * they can use the assistant.
 */
export function AupModal() {
  const [open, setOpen] = useState(false);
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    // Check if user has already accepted
    fetch("/api/compliance/aup")
      .then((r) => r.json())
      .then((data) => {
        if (!data.accepted) setOpen(true);
      })
      .catch(() => {}); // Fail open — don't block the UI if check fails

    // Backstop for the API hard gate: if any gated request (chat, temporary
    // chat, workflow run, voice) returns 403 {error:"aup_required"}, the
    // chat client dispatches this event and we force the modal open so the
    // user can accept and retry — even if the on-login check raced/failed.
    const onAupRequired = () => setOpen(true);
    window.addEventListener("asafe:aup-required", onAupRequired);
    return () =>
      window.removeEventListener("asafe:aup-required", onAupRequired);
  }, []);

  const handleAccept = async () => {
    setAccepting(true);
    try {
      const res = await fetch("/api/compliance/aup", { method: "POST" });
      if (!res.ok) {
        throw new Error(`Request failed with status ${res.status}`);
      }
      setOpen(false);
    } catch {
      // Compliance record must be written before the user proceeds. On
      // failure keep the modal open and surface the error so they can retry.
      toast.error(
        "Could not record your acceptance. Please try again or contact your administrator.",
      );
    } finally {
      setAccepting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent
        className="max-w-lg"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Conek AI — Acceptable Use Policy</DialogTitle>
          <DialogDescription>
            Please read and accept before using the assistant.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="h-64 rounded border p-4 text-sm leading-relaxed">
          <p className="mb-3 font-medium">
            You are interacting with an AI assistant.
          </p>
          <p className="mb-2">
            This tool uses artificial intelligence to help you with work tasks.
            <strong>
              {" "}
              EU AI Act, Article 50 requires us to inform you of this.
            </strong>
          </p>
          <p className="mb-2 font-medium">This tool must NOT be used to:</p>
          <ul className="mb-3 list-disc pl-5 space-y-1">
            <li>
              Make automated employment decisions (hiring, firing, performance
              grading, disciplinary actions).
            </li>
            <li>
              Process special-category personal data without explicit
              authorisation from your DPO.
            </li>
            <li>
              Generate content that is discriminatory, illegal, or violates A
              Safe Digital's Code of Conduct.
            </li>
          </ul>
          <p className="mb-2 font-medium">By using this tool you agree that:</p>
          <ul className="mb-3 list-disc pl-5 space-y-1">
            <li>
              Your prompts are logged for security and compliance purposes (GDPR
              lawful basis: legitimate interest).
            </li>
            <li>Audit logs are retained for a minimum of 6 months.</li>
            <li>
              You will exercise human oversight over all AI outputs before
              acting on them.
            </li>
            <li>
              Sensitive personal data should not be entered unless explicitly
              required and authorised.
            </li>
          </ul>
          <p className="text-muted-foreground text-xs">
            Questions? Contact your Data Protection Officer at
            dpo@asafedigital.com. Full policy: intranet/ai-policy.
          </p>
        </ScrollArea>

        <DialogFooter>
          <Button
            onClick={handleAccept}
            disabled={accepting}
            className="w-full"
          >
            {accepting ? "Recording acceptance…" : "I understand and accept"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
