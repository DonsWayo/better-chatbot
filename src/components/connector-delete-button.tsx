"use client";

import { errorToString } from "lib/utils";
import { Loader2, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { useSWRConfig } from "swr";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "ui/alert-dialog";
import { Button } from "ui/button";

import { removeMcpClientAction } from "@/app/api/mcp/actions";

/**
 * Delete affordance for the connector detail page
 * (/settings/connectors/[id]). Confirms before deleting, then calls the
 * existing removeMcpClientAction Server Action — deletion (DB row + client
 * disconnect) happens entirely server-side.
 */
export function ConnectorDeleteButton({
  id,
  name,
}: {
  id: string;
  name: string;
}) {
  const t = useTranslations();
  const router = useRouter();
  const { mutate } = useSWRConfig();
  const [open, setOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await removeMcpClientAction(id);
      toast.success(t("MCP.deletedSuccessfully"));
      mutate("/api/mcp/list");
      setOpen(false);
      router.push("/settings/connectors");
    } catch (error) {
      toast.error(errorToString(error), { id: "connector-delete-error" });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={(v) => !isDeleting && setOpen(v)}>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          className="text-muted-foreground hover:text-destructive"
          data-testid="connector-delete-button"
        >
          <Trash2 className="size-3.5" />
          {t("Common.delete")}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("MCP.deleteConfirmTitle")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("MCP.deleteConfirmDescription", { name })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button
            variant="outline"
            disabled={isDeleting}
            onClick={() => setOpen(false)}
          >
            {t("Common.cancel")}
          </Button>
          <Button
            variant="destructive"
            disabled={isDeleting}
            onClick={handleDelete}
            data-testid="connector-delete-confirm"
          >
            {isDeleting ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Trash2 className="size-3.5" />
            )}
            {t("Common.delete")}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
