"use client";

import { useState } from "react";
import { Button } from "ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "ui/card";
import { Shield, Loader2, Check } from "lucide-react";
import { toast } from "sonner";

interface UserAdminActionsProps {
  userId: string;
}

export function UserAdminActions({ userId }: UserAdminActionsProps) {
  const [resetting, setResetting] = useState(false);
  const [resetDone, setResetDone] = useState(false);

  async function handleResetRateLimit() {
    setResetting(true);
    try {
      const res = await fetch(`/api/admin/users/${userId}/reset-rate-limit`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Reset failed");
      setResetDone(true);
      toast.success(`Rate limit cleared (${data.deleted} bucket${data.deleted !== 1 ? "s" : ""} removed)`);
      setTimeout(() => setResetDone(false), 3000);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to reset rate limit");
    } finally {
      setResetting(false);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2 pt-4">
        <CardTitle className="text-sm flex items-center gap-2">
          <Shield className="size-4" />
          Admin Actions
        </CardTitle>
      </CardHeader>
      <CardContent className="pb-4 space-y-3">
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
      </CardContent>
    </Card>
  );
}
