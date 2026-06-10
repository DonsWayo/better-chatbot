"use client";

import {
  ArrowLeft,
  FileText,
  Loader2,
  Pencil,
  Trash2,
  Upload,
} from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import useSWR from "swr";
import { safe } from "ts-safe";

import {
  deleteKnowledgeCollectionAction,
  deleteKnowledgeDocumentAction,
  ingestKnowledgeTextAction,
} from "@/app/api/knowledge/actions";
import { authClient } from "auth/client";
import { notify } from "lib/notify";
import { getIsUserAdmin } from "lib/user/utils";
import { fetcher } from "lib/utils";
import { Badge } from "ui/badge";
import { Button } from "ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "ui/card";
import { Input } from "ui/input";
import { Label } from "ui/label";
import { handleErrorWithToast } from "ui/shared-toast";
import { Skeleton } from "ui/skeleton";
import { Textarea } from "ui/textarea";

import { KnowledgeCollectionDialog } from "./knowledge-collection-dialog";
import { KnowledgeVisibilityPill } from "./knowledge-visibility-pill";
import type {
  KnowledgeCollectionSummary,
  KnowledgeDocumentSummary,
} from "./types";

const TEXT_FILE_PATTERN = /\.(txt|md|markdown)$/i;

interface CollectionResponse {
  collection?: KnowledgeCollectionSummary;
}
interface DocumentsResponse {
  documents?: KnowledgeDocumentSummary[];
}

/**
 * Studio › Knowledge › collection detail — documents in the collection plus
 * (for admins) the paste/upload ingest panel. Ingestion reads .txt/.md files
 * client-side and sends plain text to the ingest server action.
 */
export function KnowledgeCollectionDetail({ id }: { id: string }) {
  const t = useTranslations();
  const router = useRouter();
  const { data: session } = authClient.useSession();
  const isAdmin = getIsUserAdmin(session?.user ?? undefined);

  const {
    data: collectionData,
    isLoading: collectionLoading,
    mutate: mutateCollection,
  } = useSWR<CollectionResponse>(`/api/knowledge/collections/${id}`, fetcher, {
    revalidateOnFocus: false,
  });
  const {
    data: documentsData,
    isLoading: documentsLoading,
    mutate: mutateDocuments,
  } = useSWR<DocumentsResponse>(
    `/api/knowledge/collections/${id}/documents`,
    fetcher,
    { revalidateOnFocus: false },
  );

  const collection = collectionData?.collection;
  const documents = documentsData?.documents ?? [];
  const canEdit =
    isAdmin || (collection?.createdBy != null && collection.createdBy === session?.user?.id);

  const [editOpen, setEditOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deletingDocId, setDeletingDocId] = useState<string | null>(null);

  const deleteCollection = useCallback(async () => {
    const ok = await notify.confirm({
      title: t("Knowledge.deleteCollection"),
      description: t("Knowledge.deleteCollectionConfirm"),
    });
    if (!ok) return;
    setDeleting(true);
    await safe(() => deleteKnowledgeCollectionAction(id))
      .ifOk(() => {
        toast.success(t("Knowledge.collectionDeleted"));
        router.push("/studio?tab=knowledge");
      })
      .ifFail(handleErrorWithToast)
      .watch(() => setDeleting(false));
  }, [id, router, t]);

  const deleteDocument = useCallback(
    async (doc: KnowledgeDocumentSummary) => {
      const ok = await notify.confirm({
        title: t("Knowledge.deleteDocument"),
        description: t("Knowledge.deleteDocumentConfirm"),
      });
      if (!ok) return;
      setDeletingDocId(doc.id);
      await safe(() =>
        deleteKnowledgeDocumentAction({
          collectionId: id,
          sourceRef: doc.sourceRef,
        }),
      )
        .ifOk(() => {
          toast.success(t("Knowledge.documentDeleted"));
          void mutateDocuments();
        })
        .ifFail(handleErrorWithToast)
        .watch(() => setDeletingDocId(null));
    },
    [id, mutateDocuments, t],
  );

  return (
    <div
      className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6 md:px-8"
      data-testid="knowledge-collection-detail"
    >
      <div>
        <Link
          href="/studio?tab=knowledge"
          className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          {t("Knowledge.backToKnowledge")}
        </Link>
      </div>

      {collectionLoading ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-8 w-1/2" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      ) : !collection ? (
        <p className="text-sm text-muted-foreground">
          {t("Knowledge.notFound")}
        </p>
      ) : (
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <h1 className="truncate font-display text-2xl">
                {collection.name}
              </h1>
              <KnowledgeVisibilityPill visibility={collection.visibility} />
            </div>
            {collection.description && (
              <p className="text-sm text-muted-foreground">
                {collection.description}
              </p>
            )}
          </div>
          {canEdit && (
            <div className="flex shrink-0 items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="rounded-full"
                onClick={() => setEditOpen(true)}
                data-testid="knowledge-edit-collection"
              >
                <Pencil className="size-3.5" />
                {t("Common.edit")}
              </Button>
              {isAdmin && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="rounded-full text-muted-foreground hover:text-destructive"
                  disabled={deleting}
                  onClick={() => void deleteCollection()}
                  data-testid="knowledge-delete-collection"
                >
                  {deleting ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="size-3.5" />
                  )}
                  {t("Common.delete")}
                </Button>
              )}
            </div>
          )}
        </div>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">
          {t("Knowledge.documents")}
        </h2>
        {documentsLoading ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full rounded-xl" />
            ))}
          </div>
        ) : documents.length === 0 ? (
          <p className="rounded-2xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
            {t("Knowledge.noDocuments")}
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {documents.map((doc) => (
              <li
                key={doc.id}
                className="flex items-center gap-3 rounded-xl border px-3 py-2.5"
                data-testid="knowledge-document-row"
              >
                <FileText
                  className="size-4 shrink-0 text-muted-foreground"
                  aria-hidden
                />
                <span className="min-w-0 flex-1 truncate text-sm">
                  {doc.sourceRef}
                </span>
                <Badge
                  variant="secondary"
                  className="shrink-0 rounded-full font-normal text-muted-foreground"
                >
                  {t("Knowledge.chunkCount", { count: doc.chunkCount })}
                </Badge>
                <span className="hidden shrink-0 text-xs text-muted-foreground sm:block">
                  {new Date(doc.createdAt).toLocaleDateString()}
                </span>
                {isAdmin && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7 shrink-0 text-muted-foreground hover:text-destructive"
                    disabled={deletingDocId === doc.id}
                    onClick={() => void deleteDocument(doc)}
                    aria-label={t("Knowledge.deleteDocument")}
                    data-testid="knowledge-delete-document"
                  >
                    {deletingDocId === doc.id ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Trash2 className="size-4" />
                    )}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {isAdmin && collection && (
        <IngestPanel
          collectionId={id}
          onIngested={() => void mutateDocuments()}
        />
      )}

      {collection && (
        <KnowledgeCollectionDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          collection={collection}
          onSaved={() => void mutateCollection()}
        />
      )}
    </div>
  );
}

/** Paste/upload ingest panel — admin only. Reads .txt/.md files client-side. */
function IngestPanel({
  collectionId,
  onIngested,
}: {
  collectionId: string;
  onIngested: () => void;
}) {
  const t = useTranslations();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [sourceRef, setSourceRef] = useState("");
  const [text, setText] = useState("");
  const [ingesting, setIngesting] = useState(false);

  const onFileSelected = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      if (!TEXT_FILE_PATTERN.test(file.name)) {
        toast.error(t("Knowledge.uploadUnsupported"));
        return;
      }
      const content = await file.text();
      setText(content);
      setSourceRef((prev) => prev.trim() || file.name);
    },
    [t],
  );

  const ingest = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed || ingesting) return;
    setIngesting(true);
    await safe(() =>
      ingestKnowledgeTextAction({
        collectionId,
        text: trimmed,
        sourceRef: sourceRef.trim() || undefined,
      }),
    )
      .ifOk((result) => {
        toast.success(
          t("Knowledge.ingestSuccess", { count: result.chunks }),
        );
        setText("");
        setSourceRef("");
        onIngested();
      })
      .ifFail(handleErrorWithToast)
      .watch(() => setIngesting(false));
  }, [collectionId, ingesting, onIngested, sourceRef, t, text]);

  return (
    <Card className="rounded-2xl" data-testid="knowledge-ingest-panel">
      <CardHeader>
        <CardTitle className="text-base">
          {t("Knowledge.addDocument")}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="knowledge-source-name">
            {t("Knowledge.sourceName")}
          </Label>
          <Input
            id="knowledge-source-name"
            value={sourceRef}
            placeholder={t("Knowledge.sourceNamePlaceholder")}
            disabled={ingesting}
            onChange={(e) => setSourceRef(e.target.value)}
            data-testid="knowledge-ingest-source"
          />
        </div>
        <Textarea
          value={text}
          placeholder={t("Knowledge.pastePlaceholder")}
          rows={6}
          disabled={ingesting}
          onChange={(e) => setText(e.target.value)}
          data-testid="knowledge-ingest-text"
        />
        <div className="flex items-center justify-between gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,.md,.markdown,text/plain,text/markdown"
            className="hidden"
            onChange={(e) => {
              void onFileSelected(e.target.files?.[0]);
              e.target.value = "";
            }}
            data-testid="knowledge-ingest-file"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-full"
            disabled={ingesting}
            onClick={() => fileInputRef.current?.click()}
            data-testid="knowledge-ingest-upload"
          >
            <Upload className="size-3.5" />
            {t("Knowledge.uploadFile")}
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={ingesting || text.trim().length === 0}
            onClick={() => void ingest()}
            data-testid="knowledge-ingest-submit"
          >
            {ingesting && <Loader2 className="size-4 animate-spin" />}
            {t("Knowledge.ingest")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
