import { MyUsageSection } from "@/components/settings/my-usage";

// Settings › Usage — the per-user self-serve usage view (moved from the
// old orphan /settings page).
export default function SettingsUsagePage() {
  return (
    <div className="rounded-2xl border bg-card p-4 shadow-xs">
      <MyUsageSection />
    </div>
  );
}
