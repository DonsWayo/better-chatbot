"use client";

import { LibraryBig, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";

import { authClient } from "auth/client";
import { getIsUserAdmin } from "lib/user/utils";
import { fetcher } from "lib/utils";
import { Button } from "ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "ui/card";
import { EmptyState } from "ui/empty-state";
import { Skeleton } from "ui/skeleton";

import { KnowledgeCollectionDialog } from "./knowledge-collection-dialog";
import { KnowledgeVisibilityPill } from "./knowledge-visibility-pill";
import type { KnowledgeCollectionSummary } from "./types";

interface CollectionsResponse {
  collections?: KnowledgeCollectionSummary[];
}

/**
 * Studio › Knowledge tab — lists every collection the viewer can see and lets
 * admins create new ones. Detail (documents, ingest) lives on
 * /studio/knowledge/[id].
 */
export function KnowledgeCollections() {
  const t = useTranslations();
  const { data: session } = authClient.useSession();
  const isAdmin = getIsUserAdmin(session?.user ?? undefined);

  const { data, isLoading, mutate } = useSWR<CollectionsResponse>(
    "/api/knowledge/collections",
    fetcher,
    { revalidateOnFocus: false },
  );
  const collections = data?.collections ?? [];

  const [createOpen, setCreateOpen] = useState(false);

  return (
    <div
      className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 md:px-8"
      data-testid="knowledge-collections"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="font-display text-2xl">{t("Knowledge.title")}</h2>
          <p className="text-sm text-muted-foreground">
            {t("Knowledge.subtitle")}
          </p>
        </div>
        {isAdmin && (
          <Button
            onClick={() => setCreateOpen(true)}
            data-testid="knowledge-new-collection"
          >
            <Plus className="size-4" />
            {t("Knowledge.newCollection")}
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="rounded-2xl">
              <CardHeader>
                <Skeleton className="h-5 w-2/3" />
                <Skeleton className="mt-2 h-4 w-full" />
                <Skeleton className="mt-1 h-4 w-1/2" />
              </CardHeader>
            </Card>
          ))}
        </div>
      ) : collections.length === 0 ? (
        <EmptyState
          icon={LibraryBig}
          title={t("Knowledge.noCollections")}
          description={t("Knowledge.noCollectionsHint")}
          action={
            isAdmin ? (
              <Button onClick={() => setCreateOpen(true)}>
                <Plus className="size-4" />
                {t("Knowledge.newCollection")}
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {collections.map((collection) => (
            <Link
              key={collection.id}
              href={`/studio/knowledge/${collection.id}`}
              data-testid="knowledge-collection-card"
            >
              <Card className="h-full rounded-2xl transition-colors hover:bg-secondary/40">
                <CardHeader>
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="truncate text-base">
                      {collection.name}
                    </CardTitle>
                    <KnowledgeVisibilityPill
                      visibility={collection.visibility}
                    />
                  </div>
                  <CardDescription className="line-clamp-2 min-h-10">
                    {collection.description || t("Knowledge.noDescription")}
                  </CardDescription>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <KnowledgeCollectionDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSaved={() => void mutate()}
      />
    </div>
  );
}
