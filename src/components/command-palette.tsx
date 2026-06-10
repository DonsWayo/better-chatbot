"use client";

import {
  ArrowLeft,
  BarChart3,
  Blocks,
  BookOpen,
  DatabaseIcon,
  FolderIcon,
  Gauge,
  Inbox,
  LayoutDashboard,
  MessageCircle,
  Plug2,
  ScrollText,
  ShieldAlert,
  SlidersHorizontal,
  Sparkles,
  Star,
  ToggleLeft,
  UserRound,
  Users,
  UsersRound,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import useSWR from "swr";

import { appStore } from "@/app/store";
import { useAgents } from "@/hooks/queries/use-agents";
import { ChatMention, ChatThread } from "app-types/chat";
import { BasicUser } from "app-types/user";
import {
  canCreateAgent,
  canCreateWorkflow,
  canEditWorkflow,
} from "lib/auth/client-permissions";
import { Shortcuts, isShortcutEvent } from "lib/keyboard-shortcuts";
import { getIsUserAdmin } from "lib/user/utils";
import { fetcher } from "lib/utils";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "ui/command";
import { WriteIcon } from "ui/write-icon";
import { useShallow } from "zustand/shallow";

// Cmd-K command palette (docs/design/information-architecture.md §6):
// search threads / folders / agents, go-to navigation (role-filtered), and
// the "Ask A-SAFE AI" fallback that turns a failed search into a chat.

type FolderLite = {
  id: string;
  name: string;
  teamName?: string | null;
};

type FolderThreadLite = {
  id: string;
  title: string;
  userId: string;
};

type FoldersResponse = {
  userId: string;
  folders: FolderLite[];
};

export function CommandPalette({ user }: { user?: BasicUser }) {
  const router = useRouter();
  const t = useTranslations("CommandPalette");
  const tLayout = useTranslations("Layout");
  const tSettings = useTranslations("Settings");
  const tAdmin = useTranslations("Admin");

  const [open, appStoreMutate] = appStore(
    useShallow((state) => [state.openCommandPalette, state.mutate]),
  );
  const [query, setQuery] = useState("");
  const [activeFolder, setActiveFolder] = useState<FolderLite | null>(null);

  const isAdmin = getIsUserAdmin(user);
  const canSeeStudio =
    canCreateAgent(user?.role) ||
    canCreateWorkflow(user?.role) ||
    canEditWorkflow(user?.role);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd+Shift+K is the temporary chat — only plain Cmd+K opens here.
      if (isShortcutEvent(e, Shortcuts.openCommandPalette) && !e.shiftKey) {
        e.preventDefault();
        appStoreMutate((prev) => ({
          openCommandPalette: !prev.openCommandPalette,
        }));
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [appStoreMutate]);

  const close = useCallback(() => {
    appStoreMutate({ openCommandPalette: false });
    setQuery("");
    setActiveFolder(null);
  }, [appStoreMutate]);

  const navigate = useCallback(
    (url: string) => {
      close();
      router.push(url);
    },
    [close, router],
  );

  // Data is only fetched while the palette is open; thread/folder keys are
  // shared with the sidebar SWR caches.
  const { data: threads } = useSWR<ChatThread[]>(
    open ? "/api/thread" : null,
    fetcher,
    { fallbackData: [] },
  );
  const { data: foldersData } = useSWR<FoldersResponse>(
    open ? "/api/teamspaces/folders" : null,
    fetcher,
  );
  const { data: folderThreads } = useSWR<FolderThreadLite[]>(
    open && activeFolder
      ? `/api/teamspaces/folders/${activeFolder.id}/threads`
      : null,
    fetcher,
    { fallbackData: [] },
  );
  const { agents } = useAgents({ limit: 50 });

  const mentionAgent = useCallback(
    (agentId: string) => {
      const agent = agents.find((a) => a.id === agentId);
      if (!agent) return;
      const newMention: ChatMention = {
        type: "agent",
        agentId: agent.id,
        name: agent.name,
        icon: agent.icon,
        description: agent.description,
      };
      const currentThreadId = appStore.getState().currentThreadId;
      if (currentThreadId) {
        appStore.setState((prev) => {
          const currentMentions = prev.threadMentions[currentThreadId] || [];
          if (
            currentMentions.some(
              (m) => m.type === "agent" && m.agentId === agent.id,
            )
          ) {
            return prev;
          }
          return {
            threadMentions: {
              ...prev.threadMentions,
              [currentThreadId]: [
                ...currentMentions.filter((v) => v.type !== "agent"),
                newMention,
              ],
            },
          };
        });
        close();
      } else {
        appStore.setState({ pendingThreadMention: newMention });
        navigate("/");
      }
    },
    [agents, close, navigate],
  );

  const askAi = useCallback(() => {
    const draft = query.trim();
    if (!draft) return;
    appStore.setState({ pendingChatDraft: draft });
    close();
    // Pushing "/" while already there would remount ChatBot with a fresh
    // key and wipe the just-prefilled composer — only navigate when needed.
    if (window.location.pathname !== "/") {
      router.push("/");
    }
  }, [query, close, router]);

  const navItems = [
    {
      id: "new-chat",
      label: tLayout("newChat"),
      icon: WriteIcon,
      url: "/",
    },
    {
      id: "inbox",
      label: tLayout("inbox"),
      icon: Inbox,
      url: "/inbox",
    },
    // Studio is builder-gated, matching the sidebar.
    ...(canSeeStudio
      ? [
          {
            id: "studio",
            label: tLayout("studio"),
            icon: Blocks,
            url: "/studio",
          },
        ]
      : []),
    {
      id: "settings-general",
      label: `${tSettings("title")} · ${tSettings("general")}`,
      icon: SlidersHorizontal,
      url: "/settings/general",
    },
    {
      id: "settings-personalization",
      label: `${tSettings("title")} · ${tSettings("personalization")}`,
      icon: Sparkles,
      url: "/settings/personalization",
    },
    {
      id: "settings-connectors",
      label: `${tSettings("title")} · ${tSettings("connectors")}`,
      icon: Plug2,
      url: "/settings/connectors",
    },
    {
      id: "settings-account",
      label: `${tSettings("title")} · ${tSettings("account")}`,
      icon: UserRound,
      url: "/settings/account",
    },
    {
      id: "settings-usage",
      label: `${tSettings("title")} · ${tSettings("usage")}`,
      icon: Gauge,
      url: "/settings/usage",
    },
    {
      id: "settings-data",
      label: `${tSettings("title")} · ${tSettings("dataControls")}`,
      icon: DatabaseIcon,
      url: "/settings/data",
    },
  ];

  const adminItems = isAdmin
    ? [
        {
          id: "admin-dashboard",
          label: tAdmin("Sidebar.dashboard"),
          icon: LayoutDashboard,
          url: "/admin",
        },
        {
          id: "admin-users",
          label: tAdmin("Users.title"),
          icon: Users,
          url: "/admin/users",
        },
        {
          id: "admin-teams",
          label: tAdmin("Teams.title"),
          icon: UsersRound,
          url: "/admin/teams",
        },
        {
          id: "admin-usage",
          label: tAdmin("Usage.title"),
          icon: BarChart3,
          url: "/admin/usage",
        },
        {
          id: "admin-mcp",
          label: tAdmin("MCP.adminTitle"),
          icon: Plug2,
          url: "/admin/mcp",
        },
        {
          id: "admin-knowledge",
          label: tAdmin("Knowledge.title"),
          icon: BookOpen,
          url: "/admin/knowledge",
        },
        {
          id: "admin-quality",
          label: tAdmin("Quality.title"),
          icon: Star,
          url: "/admin/quality",
        },
        {
          id: "admin-guardrails",
          label: tAdmin("Guardrails.title"),
          icon: ShieldAlert,
          url: "/admin/guardrails",
        },
        {
          id: "admin-feature-flags",
          label: tAdmin("FeatureFlags.title"),
          icon: ToggleLeft,
          url: "/admin/feature-flags",
        },
        {
          id: "admin-audit",
          label: tAdmin("Sidebar.audit"),
          icon: ScrollText,
          url: "/admin/audit",
        },
      ]
    : [];

  const currentUserId = foldersData?.userId;

  return (
    <CommandDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
        else appStoreMutate({ openCommandPalette: true });
      }}
      title={t("title")}
      description={t("placeholder")}
    >
      <CommandInput
        placeholder={t("placeholder")}
        value={query}
        onValueChange={setQuery}
        data-testid="command-palette-input"
      />
      <CommandList className="max-h-[420px]">
        <CommandEmpty>{t("noResults")}</CommandEmpty>

        {activeFolder ? (
          // Folder drill-in: the folder's threads
          <CommandGroup heading={activeFolder.name} forceMount>
            <CommandItem
              value="__back"
              forceMount
              onSelect={() => setActiveFolder(null)}
            >
              <ArrowLeft />
              {t("back")}
            </CommandItem>
            {(folderThreads ?? []).map((thread) => (
              <CommandItem
                key={thread.id}
                value={`${thread.title} ${thread.id}`}
                onSelect={() =>
                  navigate(
                    thread.userId === currentUserId
                      ? `/chat/${thread.id}`
                      : `/shared/${thread.id}`,
                  )
                }
              >
                <MessageCircle />
                <span className="truncate">{thread.title || "New Chat"}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        ) : (
          <>
            <CommandGroup heading={t("navigation")}>
              {navItems.map((item) => (
                <CommandItem
                  key={item.id}
                  value={item.label}
                  data-testid={`palette-nav-${item.id}`}
                  onSelect={() => navigate(item.url)}
                >
                  <item.icon className="size-4" />
                  {item.label}
                </CommandItem>
              ))}
            </CommandGroup>

            {adminItems.length > 0 && (
              <CommandGroup heading={t("admin")}>
                {adminItems.map((item) => (
                  <CommandItem
                    key={item.id}
                    value={`${t("admin")} ${item.label}`}
                    onSelect={() => navigate(item.url)}
                  >
                    <item.icon className="size-4" />
                    {item.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {(threads?.length ?? 0) > 0 && (
              <CommandGroup heading={t("threads")}>
                {threads!.slice(0, 30).map((thread) => (
                  <CommandItem
                    key={thread.id}
                    value={`${thread.title} ${thread.id}`}
                    onSelect={() => navigate(`/chat/${thread.id}`)}
                  >
                    <MessageCircle />
                    <span className="truncate">
                      {thread.title || "New Chat"}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {(foldersData?.folders?.length ?? 0) > 0 && (
              <CommandGroup heading={t("folders")}>
                {foldersData!.folders.map((folder) => (
                  <CommandItem
                    key={folder.id}
                    value={`${folder.name} ${folder.id}`}
                    onSelect={() => {
                      setActiveFolder(folder);
                      setQuery("");
                    }}
                  >
                    <FolderIcon />
                    <span className="truncate">{folder.name}</span>
                    {folder.teamName && (
                      <span className="ml-auto text-xs text-muted-foreground">
                        {folder.teamName}
                      </span>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {agents.length > 0 && (
              <CommandGroup heading={t("agents")}>
                {agents.slice(0, 20).map((agent) => (
                  <CommandItem
                    key={agent.id}
                    value={`${agent.name} ${agent.id}`}
                    onSelect={() => mentionAgent(agent.id)}
                  >
                    <Sparkles />
                    <span className="truncate">{agent.name}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </>
        )}

        {!activeFolder && query.trim().length > 0 && (
          <>
            <CommandSeparator />
            {/* forceMount on the group too — cmdk hides groups whose items
                don't match the filter, even if an item is forceMounted. */}
            <CommandGroup forceMount>
              <CommandItem
                value={`__ask ${query}`}
                forceMount
                onSelect={askAi}
                data-testid="palette-ask-ai"
              >
                <Sparkles className="text-[#9a7b00] dark:text-[#FFC72C]" />
                {t("askAi", { query: query.trim() })}
              </CommandItem>
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
