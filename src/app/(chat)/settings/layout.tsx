import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";

import { SettingsNav } from "@/components/settings/settings-nav";

// /settings is a full-page hub with its own left nav; every tab is a URL
// (docs/design/information-architecture.md §2).
export default async function SettingsLayout({
  children,
}: {
  children: ReactNode;
}) {
  const t = await getTranslations("Settings");
  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-8">
      <h1 className="mb-6 text-2xl font-semibold font-display">{t("title")}</h1>
      <div className="flex flex-col gap-6 md:flex-row md:gap-10">
        <SettingsNav />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
