"use client";

import {
  createDocumentAction,
  deleteDocumentAction,
  listDocumentsAction,
} from "@/app/api/documents/actions";
import { formatDistanceToNow } from "date-fns";
import type { DocumentSummary } from "lib/db/pg/repositories/document-repository.pg";
import { FileText, MoreHorizontal, Plus, Trash } from "lucide-react";
import { notify } from "lib/notify";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import useSWR, { mutate } from "swr";
import { Button } from "ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "ui/dropdown-menu";
import { handleErrorWithToast } from "ui/shared-toast";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarMenuSub,
  SidebarMenuSubItem,
} from "ui/sidebar";
import { Tooltip, TooltipContent, TooltipTrigger } from "ui/tooltip";

/**
 * Recent documents, presented in the sidebar as a sibling of recent chats —
 * NOT a separate "Documents" space. Mirrors AppSidebarThreads: an SWR-loaded
 * list with the same loading/empty treatment, hover actions and a header
 * affordance ("+" creates a doc and navigates to it, exactly like New Chat).
 *
 * Documents are personal/collaborative content like chat threads, so this is
 * visible to ALL authenticated users (not builder-gated). It holds NO realtime
 * connection: the near-live subscriber + presence heartbeat live only on
 * /documents/[id]. The full /documents list remains reachable via "See all".
 */

const SWR_KEY = "sidebar-documents";

// Recent cap — the sidebar is a quick-access rail, not the full archive.
// "See all" links out to /documents for the complete list.
const RECENT_LIMIT = 6;

export function AppSidebarDocuments() {
  const t = useTranslations("Documents");
  const tLayout = useTranslations("Layout");
  const router = useRouter();
  const pathname = usePathname();
  const [creating, setCreating] = useState(false);

  const { data: documents = [], isLoading } = useSWR<DocumentSummary[]>(
    SWR_KEY,
    async () => {
      const result = await listDocumentsAction();
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    { onError: handleErrorWithToast, fallbackData: [] },
  );

  const recent = documents.slice(0, RECENT_LIMIT);
  const hasMore = documents.length > RECENT_LIMIT;

  const handleCreate = async () => {
    if (creating) return;
    setCreating(true);
    const result = await createDocumentAction();
    if (!result.success) {
      setCreating(false);
      toast.error(result.error);
      return;
    }
    mutate(SWR_KEY);
    router.push(`/documents/${result.data.id}`);
  };

  const handleDelete = async (id: string) => {
    const ok = await notify.confirm({
      description: t("deleteDocumentConfirm"),
    });
    if (!ok) return;
    const result = await deleteDocumentAction(id);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    mutate(SWR_KEY);
    if (pathname === `/documents/${id}`) router.push("/documents");
  };

  return (
    <SidebarGroup>
      <SidebarGroupContent className="group-data-[collapsible=icon]:hidden group/documents">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarGroupLabel className="">
              <h4 className="text-xs text-muted-foreground group-hover/documents:text-foreground transition-colors">
                {tLayout("documents")}
              </h4>
              <div className="flex-1" />
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="opacity-0 group-hover/documents:opacity-100 transition-opacity"
                    onClick={handleCreate}
                    disabled={creating}
                    data-testid="sidebar-document-new"
                    aria-label={t("newDocument")}
                  >
                    <Plus />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">{t("newDocument")}</TooltipContent>
              </Tooltip>
            </SidebarGroupLabel>

            {isLoading ? (
              Array.from({ length: 3 }).map((_, index) => (
                <SidebarMenuSkeleton key={index} />
              ))
            ) : recent.length === 0 ? (
              <div className="px-2 py-4 text-center">
                <p className="text-sm text-muted-foreground">
                  {t("emptyTitle")}
                </p>
              </div>
            ) : (
              recent.map((doc) => {
                const editedAt = doc.lastEditedAt ?? doc.updatedAt;
                const title = doc.title || t("untitled");
                return (
                  <SidebarMenuSub key={doc.id} className="group/document mr-0">
                    <SidebarMenuSubItem>
                      <div className="flex items-center data-[state=open]:bg-input! group-hover/document:bg-input! rounded-lg">
                        <Tooltip delayDuration={1000}>
                          <TooltipTrigger asChild>
                            <SidebarMenuButton
                              asChild
                              className="group-hover/document:bg-transparent!"
                              isActive={pathname === `/documents/${doc.id}`}
                            >
                              <Link
                                href={`/documents/${doc.id}`}
                                className="flex items-center gap-2"
                                data-testid="sidebar-document-row"
                              >
                                <FileText className="size-3.5 shrink-0 text-muted-foreground" />
                                <p className="truncate min-w-0">{title}</p>
                              </Link>
                            </SidebarMenuButton>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-[200px] p-4 break-all">
                            <p className="font-medium">{title}</p>
                            <p className="text-xs text-muted-foreground mt-1">
                              {t("editedRelative", {
                                when: formatDistanceToNow(new Date(editedAt), {
                                  addSuffix: true,
                                }),
                              })}
                            </p>
                          </TooltipContent>
                        </Tooltip>

                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <SidebarMenuAction className="data-[state=open]:bg-input data-[state=open]:opacity-100 opacity-0 group-hover/document:opacity-100">
                              <MoreHorizontal />
                            </SidebarMenuAction>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent side="right" align="start">
                            <DropdownMenuItem
                              variant="destructive"
                              onClick={() => handleDelete(doc.id)}
                            >
                              <Trash />
                              {t("delete")}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </SidebarMenuSubItem>
                  </SidebarMenuSub>
                );
              })
            )}

            {hasMore && (
              <div className="w-full flex px-2 pt-1">
                <Button
                  asChild
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start text-muted-foreground hover:bg-input!"
                >
                  <Link
                    href="/documents"
                    data-testid="sidebar-documents-see-all"
                  >
                    {tLayout("seeAllDocuments")}
                  </Link>
                </Button>
              </div>
            )}
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
