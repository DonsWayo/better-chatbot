"use client";

import {
  ArrowLeft,
  BarChart3,
  BookOpen,
  LayoutDashboard,
  Plug2,
  ScrollText,
  Shield,
  ShieldAlert,
  Star,
  ToggleLeft,
  Users,
  UsersRound,
} from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo } from "react";

import { cn } from "lib/utils";

// Admin console mode-swap: this nav replaces the daily sidebar on /admin/*
// (rendered by the (admin) route-group layout). The daily sidebar keeps only
// the "Admin console" entry in the footer avatar dropdown.
// docs/design/information-architecture.md §3.

type AdminNavItem = {
  id: string;
  title: string;
  url: string;
  icon: typeof Users;
  isActive: boolean;
};

export function AdminSidebar() {
  const pathname = usePathname();
  const t = useTranslations("Admin");

  const items = useMemo<AdminNavItem[]>(
    () => [
      {
        id: "dashboard",
        title: t("Sidebar.dashboard"),
        url: "/admin",
        icon: LayoutDashboard,
        isActive:
          pathname === "/admin" ||
          (pathname.startsWith("/admin") &&
            !pathname.startsWith("/admin/users") &&
            !pathname.startsWith("/admin/teams") &&
            !pathname.startsWith("/admin/usage") &&
            !pathname.startsWith("/admin/mcp") &&
            !pathname.startsWith("/admin/knowledge") &&
            !pathname.startsWith("/admin/quality") &&
            !pathname.startsWith("/admin/guardrails") &&
            !pathname.startsWith("/admin/feature-flags") &&
            !pathname.startsWith("/admin/audit")),
      },
      {
        id: "users",
        title: t("Users.title"),
        url: "/admin/users",
        icon: Users,
        isActive: pathname.startsWith("/admin/users"),
      },
      {
        id: "teams",
        title: t("Teams.title"),
        url: "/admin/teams",
        icon: UsersRound,
        isActive: pathname.startsWith("/admin/teams"),
      },
      {
        id: "usage",
        title: t("Usage.title"),
        url: "/admin/usage",
        icon: BarChart3,
        isActive: pathname.startsWith("/admin/usage"),
      },
      {
        id: "mcp",
        title: t("MCP.adminTitle"),
        url: "/admin/mcp",
        icon: Plug2,
        isActive: pathname.startsWith("/admin/mcp"),
      },
      {
        id: "knowledge",
        title: t("Knowledge.title"),
        url: "/admin/knowledge",
        icon: BookOpen,
        isActive: pathname.startsWith("/admin/knowledge"),
      },
      {
        id: "quality",
        title: t("Quality.title"),
        url: "/admin/quality",
        icon: Star,
        isActive: pathname.startsWith("/admin/quality"),
      },
      {
        id: "guardrails",
        title: t("Guardrails.title"),
        url: "/admin/guardrails",
        icon: ShieldAlert,
        isActive: pathname.startsWith("/admin/guardrails"),
      },
      {
        id: "feature-flags",
        title: t("FeatureFlags.title"),
        url: "/admin/feature-flags",
        icon: ToggleLeft,
        isActive: pathname.startsWith("/admin/feature-flags"),
      },
      {
        id: "audit",
        title: t("Sidebar.audit"),
        url: "/admin/audit",
        icon: ScrollText,
        isActive: pathname.startsWith("/admin/audit"),
      },
    ],
    [t, pathname],
  );

  const nav = (
    <nav className="flex flex-col gap-0.5" aria-label={t("title")}>
      {items.map((item) => (
        <Link
          key={item.id}
          href={item.url}
          data-testid={`admin-sidebar-link-${item.id}`}
          className={cn(
            "flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition-colors",
            item.isActive
              ? "bg-input/50 font-medium text-foreground"
              : "text-muted-foreground hover:bg-input/30 hover:text-foreground",
          )}
        >
          <item.icon className="size-4 shrink-0" />
          <span className="truncate">{item.title}</span>
        </Link>
      ))}
    </nav>
  );

  return (
    <>
      {/* Desktop: full-height left rail */}
      <aside
        className="hidden md:flex w-56 shrink-0 flex-col gap-4 border-r border-sidebar-border/80 bg-sidebar px-3 py-4 overflow-y-auto"
        data-testid="admin-sidebar"
      >
        <Link
          href="/"
          data-testid="admin-back-to-app"
          className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-input/30 hover:text-foreground transition-colors"
        >
          <ArrowLeft className="size-4" />
          {t("Sidebar.backToApp")}
        </Link>
        <div className="flex items-center gap-2 px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <Shield className="size-3.5" />
          {t("Sidebar.adminPanel")}
        </div>
        {nav}
      </aside>
      {/* Mobile: horizontal scroller above the content */}
      <div className="md:hidden flex items-center gap-1 overflow-x-auto border-b border-sidebar-border/80 px-2 py-2">
        <Link
          href="/"
          className="flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          {t("Sidebar.backToApp")}
        </Link>
        {items.map((item) => (
          <Link
            key={item.id}
            href={item.url}
            className={cn(
              "shrink-0 rounded-full px-3 py-1.5 text-xs transition-colors",
              item.isActive
                ? "bg-input/50 font-medium text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {item.title}
          </Link>
        ))}
      </div>
    </>
  );
}
