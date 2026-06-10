"use client";

import {
  createFolderAction,
  deleteFolderAction,
  renameFolderAction,
} from "@/app/api/teamspaces/actions";
import { PresenceAvatars } from "@/components/realtime/presence-avatars";
import { cn, fetcher } from "lib/utils";
import {
  ChevronRight,
  FolderIcon,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash,
  Users,
} from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import useSWR, { mutate } from "swr";
import { Button } from "ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "ui/dropdown-menu";
import { Input } from "ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "ui/select";
import { handleErrorWithToast } from "ui/shared-toast";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubItem,
} from "ui/sidebar";

const FOLDERS_KEY = "/api/teamspaces/folders";
const PERSONAL = "__personal__";

interface FolderItem {
  id: string;
  name: string;
  parentId: string | null;
  teamId: string | null;
  teamName?: string | null;
}

interface TeamItem {
  id: string;
  name: string;
}

interface FoldersResponse {
  userId: string;
  folders: FolderItem[];
  teams: TeamItem[];
}

interface FolderThreadItem {
  id: string;
  title: string;
  userId: string;
}

function FolderThreads({
  folderId,
  currentUserId,
}: {
  folderId: string;
  currentUserId: string;
}) {
  const t = useTranslations("Teamspaces");
  const { data: threads, isLoading } = useSWR<FolderThreadItem[]>(
    `/api/teamspaces/folders/${folderId}/threads`,
    fetcher,
    { onError: handleErrorWithToast, fallbackData: [] },
  );

  if (isLoading) return null;
  if (!threads?.length) {
    return (
      <p className="px-2 py-1 text-xs text-muted-foreground">
        {t("emptyFolder")}
      </p>
    );
  }
  return (
    <>
      {threads.map((thread) => (
        <SidebarMenuSubItem key={thread.id}>
          <SidebarMenuButton asChild>
            <Link
              href={
                thread.userId === currentUserId
                  ? `/chat/${thread.id}`
                  : `/shared/${thread.id}`
              }
              className="flex items-center"
            >
              <p className="truncate min-w-0 text-sm">{thread.title}</p>
            </Link>
          </SidebarMenuButton>
        </SidebarMenuSubItem>
      ))}
    </>
  );
}

function FolderRow({
  folder,
  childFolders,
  currentUserId,
  depth,
}: {
  folder: FolderItem;
  childFolders: Map<string | null, FolderItem[]>;
  currentUserId: string;
  depth: number;
}) {
  const t = useTranslations("Teamspaces");
  const [open, setOpen] = useState(false);
  const children = childFolders.get(folder.id) ?? [];

  const handleRename = async () => {
    const name = window.prompt(t("renameFolder"), folder.name);
    if (!name?.trim() || name.trim() === folder.name) return;
    try {
      await renameFolderAction(folder.id, name.trim());
      mutate(FOLDERS_KEY);
      toast.success(t("folderRenamed"));
    } catch (error) {
      handleErrorWithToast(error as Error);
    }
  };

  const handleDelete = async () => {
    try {
      await deleteFolderAction(folder.id);
      mutate(FOLDERS_KEY);
      toast.success(t("folderDeleted"));
    } catch (error) {
      handleErrorWithToast(error as Error);
    }
  };

  return (
    <SidebarMenuSub className="group/folder mr-0">
      <SidebarMenuSubItem>
        <div className="flex items-center group-hover/folder:bg-input! rounded-lg">
          <SidebarMenuButton
            className="group-hover/folder:bg-transparent!"
            onClick={() => setOpen(!open)}
          >
            <ChevronRight
              className={cn("size-3 transition-transform", open && "rotate-90")}
            />
            {folder.teamId ? (
              <Users className="size-3.5" />
            ) : (
              <FolderIcon className="size-3.5" />
            )}
            <p className="truncate min-w-0">{folder.name}</p>
            {folder.teamName ? (
              <span className="ml-auto text-[10px] text-muted-foreground truncate">
                {folder.teamName}
              </span>
            ) : null}
          </SidebarMenuButton>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <SidebarMenuAction className="data-[state=open]:bg-input data-[state=open]:opacity-100 opacity-0 group-hover/folder:opacity-100">
                <MoreHorizontal />
              </SidebarMenuAction>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="right" align="start">
              <DropdownMenuItem onClick={handleRename}>
                <Pencil />
                {t("rename")}
              </DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onClick={handleDelete}>
                <Trash />
                {t("delete")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        {open && (
          <div className="ml-2">
            {/* Presence: teammates browsing this team folder right now.
                Mounting also heartbeats the viewer into the folder context. */}
            {folder.teamId && currentUserId && (
              <PresenceAvatars
                contextType="folder"
                contextId={folder.id}
                selfUserId={currentUserId}
                className="px-2 py-1"
              />
            )}
            {depth < 3 &&
              children.map((child) => (
                <FolderRow
                  key={child.id}
                  folder={child}
                  childFolders={childFolders}
                  currentUserId={currentUserId}
                  depth={depth + 1}
                />
              ))}
            <FolderThreads folderId={folder.id} currentUserId={currentUserId} />
          </div>
        )}
      </SidebarMenuSubItem>
    </SidebarMenuSub>
  );
}

function NewFolderDialog({ teams }: { teams: TeamItem[] }) {
  const t = useTranslations("Teamspaces");
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [teamId, setTeamId] = useState<string>(PERSONAL);
  const [saving, setSaving] = useState(false);

  const handleCreate = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await createFolderAction({
        name: name.trim(),
        teamId: teamId === PERSONAL ? null : teamId,
      });
      mutate(FOLDERS_KEY);
      toast.success(t("folderCreated"));
      setOpen(false);
      setName("");
      setTeamId(PERSONAL);
    } catch (error) {
      handleErrorWithToast(error as Error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="opacity-0 group-hover/folders:opacity-100 transition-opacity"
          aria-label={t("newFolder")}
        >
          <Plus />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("newFolder")}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <Input
            value={name}
            autoFocus
            placeholder={t("folderName")}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreate();
            }}
          />
          {teams.length > 0 && (
            <Select value={teamId} onValueChange={setTeamId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={t("selectTeam")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={PERSONAL}>{t("personal")}</SelectItem>
                {teams.map((team) => (
                  <SelectItem key={team.id} value={team.id}>
                    {team.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            {t("cancel")}
          </Button>
          <Button onClick={handleCreate} disabled={saving || !name.trim()}>
            {t("create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function SidebarFolders() {
  const t = useTranslations("Teamspaces");
  const { data } = useSWR<FoldersResponse>(FOLDERS_KEY, fetcher, {
    onError: handleErrorWithToast,
  });

  const folders = data?.folders ?? [];
  const teams = data?.teams ?? [];

  const childFolders = useMemo(() => {
    const map = new Map<string | null, FolderItem[]>();
    for (const folder of folders) {
      // Orphaned children (parent not visible to this user) surface as roots.
      const parentKey =
        folder.parentId && folders.some((f) => f.id === folder.parentId)
          ? folder.parentId
          : null;
      const list = map.get(parentKey) ?? [];
      list.push(folder);
      map.set(parentKey, list);
    }
    return map;
  }, [folders]);

  const roots = childFolders.get(null) ?? [];

  return (
    <SidebarGroup>
      <SidebarGroupContent className="group-data-[collapsible=icon]:hidden group/folders">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarGroupLabel>
              <h4 className="text-xs text-muted-foreground group-hover/folders:text-foreground transition-colors">
                {t("folders")}
              </h4>
              <div className="flex-1" />
              <NewFolderDialog teams={teams} />
            </SidebarGroupLabel>
            {roots.length === 0 ? (
              <p className="px-2 py-1 text-xs text-muted-foreground">
                {t("noFolders")}
              </p>
            ) : (
              roots.map((folder) => (
                <FolderRow
                  key={folder.id}
                  folder={folder}
                  childFolders={childFolders}
                  currentUserId={data?.userId ?? ""}
                  depth={0}
                />
              ))
            )}
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
