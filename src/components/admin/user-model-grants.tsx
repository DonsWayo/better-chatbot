"use client";

import {
  grantUserModelAction,
  revokeUserModelGrantAction,
} from "@/app/api/admin/actions";
import { format, isAfter } from "date-fns";
import { KeyRound, Loader2, Plus, Trash2 } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "ui/badge";
import { Button } from "ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "ui/select";

const APPROVED_MODELS = [
  { id: "gpt-5.5", label: "GPT-5.5" },
  { id: "claude-opus-4.8", label: "Claude Opus 4.8" },
  { id: "gemini-3.5-flash", label: "Gemini 3.5 Flash" },
  { id: "gemini-3.1-flash-lite", label: "Gemini 3.1 Flash Lite" },
  { id: "kimi-k2.6", label: "Kimi K2.6" },
  { id: "deepseek-v4-flash", label: "DeepSeek V4 Flash" },
  { id: "deepseek-v4-pro", label: "DeepSeek V4 Pro" },
];

interface Grant {
  id: string;
  modelId: string;
  grantedBy: string;
  expiresAt: string | null;
  createdAt: string;
}

interface UserModelGrantsProps {
  userId: string;
}

export function UserModelGrants({ userId }: UserModelGrantsProps) {
  const [grants, setGrants] = useState<Grant[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedModel, setSelectedModel] = useState<string>("");
  const [granting, setGranting] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const fetchGrants = async () => {
    try {
      const res = await fetch(`/api/admin/users/${userId}/model-grants`);
      if (!res.ok) return;
      const data = await res.json();
      setGrants(data.grants ?? []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGrants();
  }, [userId]);

  const handleGrant = async () => {
    if (!selectedModel) return;
    setGranting(true);
    try {
      await grantUserModelAction(userId, selectedModel);
      toast.success(`Model access granted: ${selectedModel}`);
      setSelectedModel("");
      startTransition(() => {
        fetchGrants();
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to grant model");
    } finally {
      setGranting(false);
    }
  };

  const handleRevoke = async (grantId: string, modelId: string) => {
    setRevokingId(grantId);
    try {
      await revokeUserModelGrantAction(grantId, userId);
      toast.success(`Grant revoked: ${modelId}`);
      startTransition(() => {
        fetchGrants();
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to revoke");
    } finally {
      setRevokingId(null);
    }
  };

  const isExpired = (expiresAt: string | null) =>
    expiresAt !== null && !isAfter(new Date(expiresAt), new Date());

  return (
    <Card>
      <CardHeader className="pb-2 pt-4">
        <CardTitle className="text-sm flex items-center gap-2">
          <KeyRound className="size-4" />
          Model Grants
        </CardTitle>
      </CardHeader>
      <CardContent className="pb-4 space-y-3">
        <p className="text-xs text-muted-foreground">
          Override the team's model allow-list for this user. Grants are
          per-model and optional expiry.
        </p>

        {/* Grant list */}
        {loading ? (
          <p className="text-xs text-muted-foreground italic">Loading…</p>
        ) : grants.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">
            No model grants.
          </p>
        ) : (
          <div className="space-y-2">
            {grants.map((g) => (
              <div
                key={g.id}
                className="flex items-center justify-between rounded-xl border px-3 py-1.5"
                data-testid={`grant-row-${g.modelId}`}
              >
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <code className="text-xs font-medium">{g.modelId}</code>
                    {isExpired(g.expiresAt) && (
                      <Badge
                        variant="secondary"
                        className="text-xs py-0 rounded-full border-transparent bg-red-500/15 text-red-600 dark:text-red-400"
                      >
                        expired
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Granted {format(new Date(g.createdAt), "MMM d, yyyy")}
                    {g.expiresAt && !isExpired(g.expiresAt) && (
                      <>
                        {" "}
                        · expires {format(new Date(g.expiresAt), "MMM d, yyyy")}
                      </>
                    )}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                  disabled={revokingId === g.id}
                  onClick={() => handleRevoke(g.id, g.modelId)}
                  aria-label={`Revoke ${g.modelId}`}
                  data-testid={`revoke-grant-${g.modelId}`}
                >
                  {revokingId === g.id ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="size-3.5" />
                  )}
                </Button>
              </div>
            ))}
          </div>
        )}

        {/* Add grant */}
        <div className="flex gap-2">
          <Select
            value={selectedModel}
            onValueChange={setSelectedModel}
            disabled={granting}
          >
            <SelectTrigger className="flex-1" data-testid="grant-model-select">
              <SelectValue placeholder="Select model…" />
            </SelectTrigger>
            <SelectContent>
              {APPROVED_MODELS.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            onClick={handleGrant}
            disabled={!selectedModel || granting}
            data-testid="grant-model-btn"
          >
            {granting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Plus className="size-4" />
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
