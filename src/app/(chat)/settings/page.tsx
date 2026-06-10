import { redirect } from "next/navigation";

// The settings hub lives at deep-linkable tabs; the bare /settings URL
// lands on General.
export default function SettingsIndexPage() {
  redirect("/settings/general");
}
