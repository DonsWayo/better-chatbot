"use client";

import {
  ArrowLeft,
  DatabaseIcon,
  Gauge,
  Plug2,
  SlidersHorizontal,
  Sparkles,
  UserRound,
} from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "lib/utils";

// Settings hub left nav — every tab is deep-linkable (/settings/<tab>).
// docs/design/information-architecture.md §2.
export function SettingsNav() {
  const pathname = usePathname();
  const t = useTranslations("Settings");

  const items = [
    {
      id: "general",
      title: t("general"),
      url: "/settings/general",
      icon: SlidersHorizontal,
    },
    {
      id: "personalization",
      title: t("personalization"),
      url: "/settings/personalization",
      icon: Sparkles,
    },
    {
      id: "connectors",
      title: t("connectors"),
      url: "/settings/connectors",
      icon: Plug2,
    },
    {
      id: "account",
      title: t("account"),
      url: "/settings/account",
      icon: UserRound,
    },
    {
      id: "usage",
      title: t("usage"),
      url: "/settings/usage",
      icon: Gauge,
    },
    {
      id: "data",
      title: t("dataControls"),
      url: "/settings/data",
      icon: DatabaseIcon,
    },
  ];

  return (
    <nav
      className="flex md:flex-col gap-0.5 md:w-52 shrink-0 overflow-x-auto"
      aria-label={t("title")}
    >
      <Link
        href="/"
        className="flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-sm text-muted-foreground hover:bg-input/30 hover:text-foreground transition-colors md:mb-2"
      >
        <ArrowLeft className="size-4" />
        {t("backToApp")}
      </Link>
      {items.map((item) => {
        const isActive = pathname.startsWith(item.url);
        return (
          <Link
            key={item.id}
            href={item.url}
            data-testid={`settings-nav-${item.id}`}
            className={cn(
              "flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition-colors",
              isActive
                ? "bg-input/50 font-medium text-foreground"
                : "text-muted-foreground hover:bg-input/30 hover:text-foreground",
            )}
          >
            <item.icon className="size-4 shrink-0" />
            <span className="truncate">{item.title}</span>
          </Link>
        );
      })}
    </nav>
  );
}
