import { UserInstructionsContent } from "@/components/chat-preferences-content";

// Settings › Personalization — display name, bot name, profession, response
// styles. Split out of the retired Chat Preferences popup (pane 1).
// docs/design/information-architecture.md §2.
export default function SettingsPersonalizationPage() {
  return (
    <section className="rounded-2xl border bg-card p-6 shadow-xs">
      <UserInstructionsContent />
    </section>
  );
}
