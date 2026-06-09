"use client";

import { useState } from "react";
import { Button } from "ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "ui/card";
import { resetUserRateLimitAction, eraseUserDataAction } from "@/app/api/admin/actions";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "ui/dialog";
import { Shield, Loader2, Check, Download, Trash2 } from "lucide-react";
import { toast } from "sonner";

interface UserAdminActionsProps {
  userId: string;
}

export function UserAdminActions({ userId }: UserAdminActionsProps) {
  const [resetting, setResetting] = useState(false);
  const [resetDone, setResetDone] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [erasing, setErasing] = useState(false);
  const [showEraseConfirm, setShowEraseConfirm] = useState(false);

  async function handleResetRateLimit() {
    setResetting(true);
    try {
      const deleted = await resetUserRateLimitAction(userId);
      setResetDone(true);
      toast.success(`Rate limit cleared (${deleted} bucket${deleted !== 1 ? "s" : ""} removed)`);
      setTimeout(() => setResetDone(false), 3000);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to reset rate limit");
    } finally {
      setResetting(false);
    }
  }

  async function handleDataExport() {
    setExporting(true);
    try {
      const res = await fetch(`/api/admin/users/${userId}/data-export`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as any).error ?? "Export failed");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `user-${userId}-export.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("Data export downloaded");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }

  async function handleErase() {
    setErasing(true);
    setShowEraseConfirm(false);
    try {
      await eraseUserDataAction(userId);
      toast.success("User data erased successfully (GDPR Article 17)");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erasure failed");
    } finally {
      setErasing(false);
    }
  }

  return (
    <>
      <Card>
        <CardHeader className="pb-2 pt-4">
          <CardTitle className="text-sm flex items-center gap-2">
            <Shield className="size-4" />
            Admin Actions
          </CardTitle>
        </CardHeader>
        <CardContent className="pb-4 space-y-3">
          {/* Rate limit reset */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Rate Limit</p>
              <p className="text-xs text-muted-foreground">
                Clear all rate-limit buckets so this user can send requests immediately.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleResetRateLimit}
              disabled={resetting}
              data-testid="reset-rate-limit-btn"
            >
              {resetting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : resetDone ? (
                <Check className="size-4 text-green-500" />
              ) : (
                "Reset"
              )}
            </Button>
          </div>

          {/* GDPR data export */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Data Export</p>
              <p className="text-xs text-muted-foreground">
                Download all data held for this user (GDPR Article 20).
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleDataExport}
              disabled={exporting}
              data-testid="data-export-btn"
            >
              {exporting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <>
                  <Download className="size-4 mr-1" />
                  Export
                </>
              )}
            </Button>
          </div>

          {/* GDPR erasure */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-destructive">Erase User Data</p>
              <p className="text-xs text-muted-foreground">
                Anonymise and delete all user data. Irreversible (GDPR Article 17).
              </p>
            </div>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setShowEraseConfirm(true)}
              disabled={erasing}
              data-testid="erase-data-btn"
            >
              {erasing ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <>
                  <Trash2 className="size-4 mr-1" />
                  Erase
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Erasure confirmation dialog */}
      <Dialog open={showEraseConfirm} onOpenChange={setShowEraseConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Permanently erase user data?</DialogTitle>
            <DialogDescription>
              This action cannot be undone. The user&apos;s name, email, and all associated chat history
              will be permanently anonymised and deleted. An erasure audit record will be kept for
              compliance purposes.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEraseConfirm(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleErase}
              data-testid="confirm-erase-btn"
            >
              Yes, erase permanently
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
