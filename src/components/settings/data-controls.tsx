"use client";

import { Download, FolderSearchIcon, PlusIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useState } from "react";

import { useArchives } from "@/hooks/queries/use-archives";
import { Button } from "ui/button";
import { Skeleton } from "ui/skeleton";
import { ArchiveDialog } from "../archive-dialog";
import { ExportsManagementContent } from "../chat-preferences-content";

// Settings › Data controls — GDPR export, My Exports (re-homed from the
// retired Chat Preferences popup) + Archives. This replaces the old
// admin-only sidebar Archive group; /archive/[id] keeps working.
export function DataControls() {
  const t = useTranslations("Settings");
  const tArchive = useTranslations("Archive");
  const [addArchiveDialogOpen, setAddArchiveDialogOpen] = useState(false);
  const { data: archives, isLoading: isLoadingArchives } = useArchives();

  return (
    <div className="flex flex-col gap-4">
      {/* GDPR export */}
      <section className="rounded-2xl border bg-card p-4 shadow-xs">
        <h2 className="text-sm font-medium">{t("gdprTitle")}</h2>
        <p className="mt-1 mb-4 text-xs text-muted-foreground">
          {t("gdprDescription")}
        </p>
        <a href="/api/user/export" download>
          <Button variant="outline" size="sm" className="rounded-full">
            <Download className="mr-2 size-4" />
            {t("downloadMyData")}
          </Button>
        </a>
      </section>

      {/* Archives */}
      <section className="rounded-2xl border bg-card p-4 shadow-xs">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-medium">{tArchive("title")}</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("archivesDescription")}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="rounded-full"
            onClick={() => setAddArchiveDialogOpen(true)}
            data-testid="settings-add-archive"
          >
            <PlusIcon className="mr-1 size-4" />
            {tArchive("addArchive")}
          </Button>
        </div>
        <div className="mt-4">
          {isLoadingArchives ? (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 2 }).map((_, index) => (
                <Skeleton key={index} className="h-10 w-full rounded-xl" />
              ))}
            </div>
          ) : !archives || archives.length === 0 ? (
            <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
              {tArchive("noArchives")}
            </div>
          ) : (
            <ul className="flex flex-col gap-1">
              {archives.map((archive) => (
                <li key={archive.id}>
                  <Link
                    href={`/archive/${archive.id}`}
                    className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition-colors hover:bg-muted/50"
                    data-testid="settings-archive-link"
                  >
                    <FolderSearchIcon className="size-4 shrink-0 text-muted-foreground" />
                    <span className="truncate">{archive.name}</span>
                    <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                      {archive.itemCount}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* My Exports — shared chat links (from the retired popup's third pane) */}
      <section className="rounded-2xl border bg-card p-4 shadow-xs">
        <ExportsManagementContent />
      </section>

      <ArchiveDialog
        open={addArchiveDialogOpen}
        onOpenChange={setAddArchiveDialogOpen}
      />
    </div>
  );
}
