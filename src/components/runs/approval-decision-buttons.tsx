"use client";

import { Check, Loader2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import {
  approveRequestAction,
  rejectRequestAction,
} from "@/app/api/agent-platform/actions";
import { cn } from "lib/utils";
import { Button } from "ui/button";
import { handleErrorWithToast } from "ui/shared-toast";
import { Textarea } from "ui/textarea";

const REJECT_REASON_MAX = 500;

// Agent Platform #26 — Approve/Reject controls for a pending approval
// request. Shared between the Triage inbox cards and the /runs/[id] header.
// Reject requires a reason; both paths refresh the server-rendered page.

export function ApprovalDecisionButtons({
  requestId,
  className,
}: {
  requestId: string;
  className?: string;
}) {
  const t = useTranslations("Triage");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [decided, setDecided] = useState(false);
  // Which decision is in flight, so only the clicked button shows a spinner.
  const [pending, setPending] = useState<"approve" | "reject" | null>(null);

  const approve = () => {
    setPending("approve");
    startTransition(async () => {
      // The action returns a structured result instead of throwing so its gate
      // reason survives prod's masked-500.
      const result = await approveRequestAction(requestId);
      if (!result.success) {
        setPending(null);
        handleErrorWithToast(new Error(result.error));
        return;
      }
      setDecided(true);
      toast.success(t("approved"));
      router.refresh();
    });
  };

  const reject = () => {
    if (!reason.trim()) return;
    setPending("reject");
    startTransition(async () => {
      const result = await rejectRequestAction(requestId, reason.trim());
      if (!result.success) {
        setPending(null);
        handleErrorWithToast(new Error(result.error));
        return;
      }
      setDecided(true);
      toast.success(t("rejected"));
      router.refresh();
    });
  };

  // Optimistic: hide the controls as soon as a decision lands; the
  // router.refresh() above re-renders the page without this request.
  if (decided) return null;

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {rejecting ? (
        <>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value.slice(0, REJECT_REASON_MAX))}
            placeholder={t("rejectReasonPlaceholder")}
            className="min-h-20 rounded-xl text-sm"
            maxLength={REJECT_REASON_MAX}
            disabled={isPending}
            data-testid="approval-reject-reason"
          />
          <p className="text-right text-[11px] text-muted-foreground tabular-nums">
            {reason.length}/{REJECT_REASON_MAX}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="destructive"
              size="sm"
              className="rounded-full"
              disabled={isPending || !reason.trim()}
              onClick={reject}
              data-testid="approval-confirm-reject"
            >
              {pending === "reject" ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <X className="size-3.5" />
              )}
              {t("confirmReject")}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="rounded-full"
              disabled={isPending}
              onClick={() => setRejecting(false)}
            >
              {t("cancel")}
            </Button>
          </div>
        </>
      ) : (
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            className="rounded-full bg-primary text-primary-foreground hover:bg-[#2BA6AD]"
            disabled={isPending}
            onClick={approve}
            data-testid="approval-approve"
          >
            {pending === "approve" ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Check className="size-3.5" />
            )}
            {t("approve")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="rounded-full"
            disabled={isPending}
            onClick={() => setRejecting(true)}
            data-testid="approval-reject"
          >
            <X className="size-3.5" />
            {t("reject")}
          </Button>
        </div>
      )}
    </div>
  );
}
