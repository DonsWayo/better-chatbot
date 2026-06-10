import { UserInstructionsContent } from "@/components/chat-preferences-content";
import { MemoryManager } from "@/components/memory/memory-manager";

// Settings › Personalization — display name, bot name, profession, response
// styles. Split out of the retired Chat Preferences popup (pane 1).
// docs/design/information-architecture.md §2.
// Plus the user-memory manager (docs/design/user-memory.md): tri-state
// control + per-item transparency over what the assistant remembers.
export default function SettingsPersonalizationPage() {
  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-2xl border bg-card p-6 shadow-xs">
        <UserInstructionsContent />
      </section>
      <section className="rounded-2xl border bg-card p-6 shadow-xs">
        <MemoryManager />
      </section>
    </div>
  );
}
