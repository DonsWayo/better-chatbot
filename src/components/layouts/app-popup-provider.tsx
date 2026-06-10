"use client";

import { BasicUser } from "app-types/user";
import dynamic from "next/dynamic";

const CommandPalette = dynamic(
  () =>
    import("@/components/command-palette").then((mod) => mod.CommandPalette),
  {
    ssr: false,
  },
);

const KeyboardShortcutsPopup = dynamic(
  () =>
    import("@/components/keyboard-shortcuts-popup").then(
      (mod) => mod.KeyboardShortcutsPopup,
    ),
  {
    ssr: false,
  },
);

const ChatBotVoice = dynamic(
  () => import("@/components/chat-bot-voice").then((mod) => mod.ChatBotVoice),
  {
    ssr: false,
  },
);

const ChatBotTemporary = dynamic(
  () =>
    import("@/components/chat-bot-temporary").then(
      (mod) => mod.ChatBotTemporary,
    ),
  {
    ssr: false,
  },
);

// Retired (moved to /settings/*): ChatPreferencesPopup → Personalization,
// UserSettingsPopup → Account, McpCustomizationPopup → Connectors rows.
// docs/design/information-architecture.md §2.
export function AppPopupProvider({
  user,
}: {
  user?: BasicUser;
}) {
  return (
    <>
      <CommandPalette user={user} />
      <KeyboardShortcutsPopup />
      <ChatBotVoice />
      <ChatBotTemporary />
    </>
  );
}
