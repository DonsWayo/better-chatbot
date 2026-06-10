"use client";

import { MoonStar, Sun } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { useCallback } from "react";
import useSWR from "swr";

import { useThemeStyle } from "@/hooks/use-theme-style";
import { getLocaleAction } from "@/i18n/get-locale";
import { BASE_THEMES, COOKIE_KEY_LOCALE, SUPPORTED_LOCALES } from "lib/const";
import { capitalizeFirstLetter, cn } from "lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "ui/select";

// Settings › General — theme and language. Same mechanisms the footer
// dropdown used (next-themes, theme-style storage, locale cookie + reload).
export function GeneralSettings() {
  const t = useTranslations("Settings");
  const { theme = "light", setTheme } = useTheme();
  const { themeStyle = "default", setThemeStyle } = useThemeStyle();

  const { data: currentLocale } = useSWR(COOKIE_KEY_LOCALE, getLocaleAction, {
    fallbackData: SUPPORTED_LOCALES[0].code,
    revalidateOnFocus: false,
  });
  const handleLocaleChange = useCallback((locale: string) => {
    document.cookie = `${COOKIE_KEY_LOCALE}=${locale}; path=/;`;
    window.location.reload();
  }, []);

  return (
    <div className="flex flex-col gap-4">
      {/* Theme */}
      <section className="rounded-2xl border bg-card p-4 shadow-xs">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-medium">{t("theme")}</h2>
            <p className="text-xs text-muted-foreground">
              {t("themeDescription")}
            </p>
          </div>
          <div
            className="flex cursor-pointer items-center rounded-full border"
            onClick={() => setTheme(theme === "light" ? "dark" : "light")}
            role="switch"
            aria-checked={theme === "dark"}
            aria-label={t("theme")}
            data-testid="settings-theme-toggle"
          >
            <div
              className={cn(
                theme === "dark" &&
                  "bg-accent ring ring-muted-foreground/40 text-foreground",
                "rounded-full p-1.5",
              )}
            >
              <MoonStar className="size-3.5" />
            </div>
            <div
              className={cn(
                theme === "light" &&
                  "bg-accent ring ring-muted-foreground/40 text-foreground",
                "rounded-full p-1.5",
              )}
            >
              <Sun className="size-3.5" />
            </div>
          </div>
        </div>
        <div className="mt-4 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-medium">{t("themeStyle")}</h2>
            <p className="text-xs text-muted-foreground">
              {t("themeStyleDescription")}
            </p>
          </div>
          <Select value={themeStyle} onValueChange={setThemeStyle}>
            <SelectTrigger className="w-48" data-testid="settings-theme-style">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-h-96">
              {BASE_THEMES.map((style) => (
                <SelectItem key={style} value={style}>
                  {capitalizeFirstLetter(style)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </section>

      {/* Language */}
      <section className="rounded-2xl border bg-card p-4 shadow-xs">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-medium">{t("language")}</h2>
            <p className="text-xs text-muted-foreground">
              {t("languageDescription")}
            </p>
          </div>
          <Select
            value={currentLocale}
            onValueChange={(locale) =>
              locale !== currentLocale && handleLocaleChange(locale)
            }
          >
            <SelectTrigger className="w-48" data-testid="settings-language">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-h-96">
              {SUPPORTED_LOCALES.map((locale) => (
                <SelectItem key={locale.code} value={locale.code}>
                  {locale.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </section>
    </div>
  );
}
