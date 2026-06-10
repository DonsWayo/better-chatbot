"use client";

import { Check, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  approveRequestAction,
  rejectRequestAction,
} from "@/app/api/agent-platform/actions";
import { cn } from "lib/utils";
import { Button } from "ui/button";
import { handleErrorWithToast } from "ui/shared-toast";
import { Textarea } from "ui/textarea";

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

  const approve = () => {
    startTransition(async () => {
      try {
        await approveRequestAction(requestId);
        setDecided(true);
        router.refresh();
      } catch (error) {
        handleErrorWithToast(error as Error);
      }
    });
  };

  const reject = () => {
    if (!reason.trim()) return;
    startTransition(async () => {
      try {
        await rejectRequestAction(requestId, reason.trim());
        setDecided(true);
        router.refresh();
      } catch (error) {
        handleErrorWithToast(error as Error);
      }
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
            onChange={(e) => setReason(e.target.value)}
            placeholder={t("rejectReasonPlaceholder")}
            className="min-h-20 rounded-xl text-sm"
            disabled={isPending}
            data-testid="approval-reject-reason"
          />
          <div className="flex items-center gap-2">
            <Button
              variant="destructive"
              size="sm"
              className="rounded-full"
              disabled={isPending || !reason.trim()}
              onClick={reject}
              data-testid="approval-confirm-reject"
            >
              <X className="size-3.5" />
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
            className="rounded-full bg-[#FFC72C] text-black hover:bg-[#FFC72C]/80"
            disabled={isPending}
            onClick={approve}
            data-testid="approval-approve"
          >
            <Check className="size-3.5" />
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
