"use client";

import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { safe } from "ts-safe";

import {
  createKnowledgeCollectionAction,
  updateKnowledgeCollectionAction,
} from "@/app/api/knowledge/actions";
import { VisibilityField } from "@/components/visibility/visibility-field";
import type { VisibilityValue } from "@/components/visibility/visibility-picker";
import { Button } from "ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "ui/dialog";
import { Input } from "ui/input";
import { Label } from "ui/label";
import { handleErrorWithToast } from "ui/shared-toast";
import { Textarea } from "ui/textarea";

import {
  type KnowledgeCollectionSummary,
  normalizeCollectionVisibility,
} from "./types";

interface KnowledgeCollectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When present the dialog edits this collection; otherwise it creates. */
  collection?: KnowledgeCollectionSummary;
  /** Called after a successful create/update (e.g. to revalidate SWR). */
  onSaved: () => void;
}

/** Create / edit dialog for a knowledge collection (name, description, visibility). */
export function KnowledgeCollectionDialog({
  open,
  onOpenChange,
  collection,
  onSaved,
}: KnowledgeCollectionDialogProps) {
  const t = useTranslations();
  const isEdit = Boolean(collection);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [visibilityValue, setVisibilityValue] = useState<VisibilityValue>({
    visibility: "private",
    teamIds: [],
  });
  const [saving, setSaving] = useState(false);

  // Re-seed the form whenever the dialog opens (create: blank, edit: row).
  useEffect(() => {
    if (!open) return;
    setName(collection?.name ?? "");
    setDescription(collection?.description ?? "");
    setVisibilityValue({
      visibility: normalizeCollectionVisibility(collection?.visibility),
      teamIds: collection?.teamIds ?? [],
    });
  }, [open, collection]);

  const submit = useCallback(async () => {
    const trimmed = name.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    const payload = {
      name: trimmed,
      description: description.trim() || null,
      visibility: visibilityValue.visibility,
      teamIds:
        visibilityValue.visibility === "team" ? visibilityValue.teamIds : null,
    };
    await safe(() =>
      collection
        ? updateKnowledgeCollectionAction(collection.id, payload)
        : createKnowledgeCollectionAction(payload),
    )
      .ifOk(() => {
        toast.success(
          t(isEdit ? "Knowledge.collectionUpdated" : "Knowledge.collectionCreated"),
        );
        onOpenChange(false);
        onSaved();
      })
      .ifFail(handleErrorWithToast)
      .watch(() => setSaving(false));
  }, [
    name,
    description,
    visibilityValue,
    collection,
    isEdit,
    onOpenChange,
    onSaved,
    saving,
    t,
  ]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-lg"
        data-testid="knowledge-collection-dialog"
      >
        <DialogHeader>
          <DialogTitle>
            {t(isEdit ? "Knowledge.editCollection" : "Knowledge.newCollection")}
          </DialogTitle>
          <DialogDescription>{t("Knowledge.subtitle")}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-1">
          <div className="flex flex-col gap-2">
            <Label htmlFor="knowledge-collection-name">
              {t("Knowledge.nameLabel")}
            </Label>
            <Input
              id="knowledge-collection-name"
              value={name}
              placeholder={t("Knowledge.namePlaceholder")}
              disabled={saving}
              onChange={(e) => setName(e.target.value)}
              data-testid="knowledge-collection-name"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="knowledge-collection-description">
              {t("Knowledge.descriptionLabel")}
            </Label>
            <Textarea
              id="knowledge-collection-description"
              value={description}
              placeholder={t("Knowledge.descriptionPlaceholder")}
              disabled={saving}
              rows={3}
              className="resize-none"
              onChange={(e) => setDescription(e.target.value)}
              data-testid="knowledge-collection-description"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label>{t("Visibility.label")}</Label>
            <VisibilityField
              value={visibilityValue}
              onChange={setVisibilityValue}
              disabled={saving}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            disabled={saving}
            onClick={() => onOpenChange(false)}
          >
            {t("Common.cancel")}
          </Button>
          <Button
            type="button"
            disabled={saving || name.trim().length === 0}
            onClick={() => void submit()}
            data-testid="knowledge-collection-save"
          >
            {saving && <Loader2 className="size-4 animate-spin" />}
            {t(isEdit ? "Common.save" : "Common.create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
