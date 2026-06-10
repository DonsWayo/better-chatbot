"use client";

import { BasicUser } from "app-types/user";
import { authClient } from "auth/client";
import { getIsUserAdmin, getUserAvatar } from "lib/user/utils";
import { fetcher } from "lib/utils";
import {
  ChevronsUpDown,
  LogOutIcon,
  MoonStar,
  Settings,
  ShieldCheck,
  Sun,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import Link from "next/link";
import { Suspense } from "react";
import useSWR from "swr";
import { Avatar, AvatarFallback, AvatarImage } from "ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "ui/dropdown-menu";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "ui/sidebar";
import { Skeleton } from "ui/skeleton";

// Slim footer dropdown: Settings, theme quick-toggle, Admin console
// (admins only), Sign out. Everything else lives at /settings/*.
// docs/design/information-architecture.md §1 item 10.
export function AppSidebarUserInner(props: {
  user?: BasicUser;
}) {
  const { data: user } = useSWR<BasicUser>(`/api/user/details`, fetcher, {
    fallbackData: props.user,
    suspense: true,
    revalidateOnMount: false,
    revalidateOnFocus: false,
    shouldRetryOnError: false,
    refreshInterval: 1000 * 60 * 10,
  });
  const t = useTranslations("Layout");
  const { theme = "light", setTheme } = useTheme();
  const isAdmin = getIsUserAdmin(user);

  const logout = () => {
    authClient.signOut().finally(() => {
      window.location.href = "/sign-in";
    });
  };

  if (!user) return null;

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground bg-input/30 border"
              size={"lg"}
              data-testid="sidebar-user-button"
            >
              <Avatar className="rounded-full size-8 border">
                <AvatarImage
                  className="object-cover"
                  src={getUserAvatar(user)}
                  alt={user?.name || "User"}
                />
                <AvatarFallback>{user?.name?.slice(0, 1) || ""}</AvatarFallback>
              </Avatar>
              <span className="truncate" data-testid="sidebar-user-email">
                {user?.email}
              </span>
              <ChevronsUpDown className="ml-auto" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            side="top"
            className="bg-background w-[--radix-dropdown-menu-trigger-width] min-w-60 rounded-lg"
            align="center"
          >
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                <Avatar className="h-8 w-8 rounded-full">
                  <AvatarImage
                    src={getUserAvatar(user)}
                    alt={user?.name || "User"}
                  />
                  <AvatarFallback className="rounded-lg">
                    {user?.name?.slice(0, 1) || ""}
                  </AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span
                    className="truncate font-medium"
                    data-testid="sidebar-user-name"
                  >
                    {user?.name}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {user?.email}
                  </span>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />

            <DropdownMenuItem
              asChild
              className="cursor-pointer"
              data-testid="user-settings-menu-item"
            >
              <Link href="/settings">
                <Settings className="size-4 text-foreground" />
                <span>{t("settings")}</span>
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem
              className="cursor-pointer"
              onClick={(e) => {
                e.preventDefault();
                setTheme(theme === "light" ? "dark" : "light");
              }}
              data-testid="theme-quick-toggle"
            >
              {theme === "light" ? (
                <MoonStar className="size-4 text-foreground" />
              ) : (
                <Sun className="size-4 text-foreground" />
              )}
              <span>{t("theme")}</span>
            </DropdownMenuItem>
            {isAdmin && (
              <DropdownMenuItem
                asChild
                className="cursor-pointer"
                data-testid="admin-console-menu-item"
              >
                <Link href="/admin">
                  <ShieldCheck className="size-4 text-foreground" />
                  <span>{t("adminConsole")}</span>
                </Link>
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={logout} className="cursor-pointer">
              <LogOutIcon className="size-4 text-foreground" />
              <span>{t("signOut")}</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

export function AppSidebarUserSkeleton() {
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton
          className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground bg-input/30 border"
          size={"lg"}
          data-testid="sidebar-user-button"
        >
          <Skeleton className="h-8 w-8 rounded-full" />
          <Skeleton className="h-4 w-24" />
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

export function AppSidebarUser({
  user,
}: {
  user?: BasicUser;
}) {
  return (
    <Suspense fallback={<AppSidebarUserSkeleton />}>
      <AppSidebarUserInner user={user} />
    </Suspense>
  );
}
