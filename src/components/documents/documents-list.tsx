"use client";

import {
  createDocumentAction,
  listDocumentsAction,
} from "@/app/api/documents/actions";
import { formatDistanceToNow } from "date-fns";
import type { DocumentSummary } from "lib/db/pg/repositories/document-repository.pg";
import { cn } from "lib/utils";
import { FileText, Globe, Loader2, Lock, Plus, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import useSWR from "swr";
import { Badge } from "ui/badge";
import { Button } from "ui/button";
import { Skeleton } from "ui/skeleton";

/**
 * The /documents list. Pure client list over listDocumentsAction (the user's
 * own + accessible shared/team/company docs). "New document" creates a blank doc
 * and redirects to its editor. Holds NO realtime connection — the near-live
 * subscriber and presence heartbeat live only on /documents/[id].
 */

const VIS_ICON: Record<string, typeof Lock> = {
  private: Lock,
  shared: Users,
  team: Users,
  company: Globe,
};

export function DocumentsList({
  initialDocuments,
}: {
  initialDocuments: DocumentSummary[];
}) {
  const t = useTranslations("Documents");
  const tRoot = useTranslations();
  const router = useRouter();
  const [creating, setCreating] = useState(false);

  const { data: documents = initialDocuments, isLoading } = useSWR<
    DocumentSummary[]
  >(
    "documents-list",
    async () => {
      const result = await listDocumentsAction();
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    { fallbackData: initialDocuments, revalidateOnFocus: false },
  );

  const handleCreate = async () => {
    setCreating(true);
    const result = await createDocumentAction();
    if (!result.success) {
      setCreating(false);
      toast.error(result.error);
      return;
    }
    router.push(`/documents/${result.data.id}`);
  };

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        <Button
          onClick={handleCreate}
          disabled={creating}
          className="gap-1.5 rounded-full"
          data-testid="document-new"
        >
          {creating ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Plus className="size-4" />
          )}
          {t("newDocument")}
        </Button>
      </div>

      {isLoading && documents.length === 0 ? (
        <div className="space-y-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : documents.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border py-16 text-center"
          data-testid="documents-empty"
        >
          <FileText className="mb-3 size-10 text-muted-foreground/40" />
          <p className="font-medium">{t("emptyTitle")}</p>
          <p className="mb-4 text-sm text-muted-foreground">
            {t("emptyDescription")}
          </p>
          <Button
            onClick={handleCreate}
            disabled={creating}
            variant="secondary"
            className="gap-1.5 rounded-full"
          >
            <Plus className="size-4" />
            {t("newDocument")}
          </Button>
        </div>
      ) : (
        <ul className="flex flex-col gap-1.5" data-testid="documents-list">
          {documents.map((doc) => {
            const Icon = VIS_ICON[doc.visibility] ?? Lock;
            const editedAt = doc.lastEditedAt ?? doc.updatedAt;
            return (
              <li key={doc.id}>
                <button
                  type="button"
                  onClick={() => router.push(`/documents/${doc.id}`)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl border border-border/60 px-4 py-3 text-left transition-colors",
                    "hover:border-border hover:bg-secondary/50",
                  )}
                  data-testid="document-row"
                >
                  <FileText className="size-5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">
                      {doc.title || t("untitled")}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t("editedRelative", {
                        when: formatDistanceToNow(new Date(editedAt), {
                          addSuffix: true,
                        }),
                      })}
                    </p>
                  </div>
                  <Badge
                    variant="secondary"
                    className="shrink-0 gap-1 rounded-full font-normal"
                  >
                    <Icon className="size-3" />
                    {tRoot(`Visibility.${doc.visibility}`)}
                  </Badge>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
