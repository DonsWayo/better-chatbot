"use client";

export type Shortcut = {
  description?: string;
  shortcut: {
    key?: string;
    shift?: boolean;
    command?: boolean;
    backspace?: boolean;
  };
};

const openNewChatShortcut: Shortcut = {
  description: "newChat",
  shortcut: {
    key: "O",
    shift: true,
    command: true,
  },
};

// Cmd+K belongs to the command palette (the universal convention);
// temporary chat moved to Cmd+Shift+K.
const openCommandPaletteShortcut: Shortcut = {
  description: "openCommandPalette",
  shortcut: {
    key: "K",
    command: true,
  },
};

const toggleTemporaryChatShortcut: Shortcut = {
  description: "toggleTemporaryChat",
  shortcut: {
    key: "K",
    command: true,
    shift: true,
  },
};

const toggleVoiceChatShortcut: Shortcut = {
  description: "toggleVoiceChat",
  shortcut: {
    key: "I",
    command: true,
    shift: true,
  },
};

const toggleSidebarShortcut: Shortcut = {
  description: "toggleSidebar",
  shortcut: {
    key: "S",
    command: true,
    shift: true,
  },
};

const toolModeShortcut: Shortcut = {
  description: "toolMode",
  shortcut: {
    key: "P",
    command: true,
  },
};

const lastMessageCopyShortcut: Shortcut = {
  description: "lastMessageCopy",
  shortcut: {
    key: "C",
    command: true,
    shift: true,
  },
};

const deleteThreadShortcut: Shortcut = {
  description: "deleteThread",
  shortcut: {
    backspace: true,
    shift: true,
  },
};

const openShortcutsPopupShortcut: Shortcut = {
  description: "openShortcutsPopup",
  shortcut: {
    key: "/",
    command: true,
  },
};

// Cmd+Shift+L used to open the retired Chat Preferences popup; it now
// routes to Settings › Personalization (handled in command-palette.tsx).
const openPersonalizationShortcut: Shortcut = {
  description: "openPersonalization",
  shortcut: {
    key: "L",
    command: true,
    shift: true,
  },
};

export const Shortcuts = {
  openNewChat: openNewChatShortcut,
  openCommandPalette: openCommandPaletteShortcut,
  openPersonalization: openPersonalizationShortcut,
  toggleTemporaryChat: toggleTemporaryChatShortcut,
  toggleVoiceChat: toggleVoiceChatShortcut,
  toggleSidebar: toggleSidebarShortcut,
  lastMessageCopy: lastMessageCopyShortcut,
  deleteThread: deleteThreadShortcut,
  toolMode: toolModeShortcut,
  openShortcutsPopup: openShortcutsPopupShortcut,
};

/**
 * Two-key "go to" sequences, Linear/Superhuman style: press `g`, then a
 * second key within CHORD_TIMEOUT_MS to navigate. Listed in the shortcuts
 * help popup under a "Go to" section.
 */
export type NavigationChord = {
  /** i18n key inside the KeyboardShortcuts namespace */
  description: string;
  /** [first, second] keys, lowercase */
  keys: [string, string];
  href: string;
  /** Only navigate when the user can see Studio (builders/admins). */
  requiresStudio?: boolean;
};

export const CHORD_TIMEOUT_MS = 1500;

export const NavigationChords: NavigationChord[] = [
  { description: "goToHome", keys: ["g", "h"], href: "/" },
  { description: "goToInbox", keys: ["g", "i"], href: "/inbox" },
  {
    description: "goToStudio",
    keys: ["g", "s"],
    href: "/studio",
    requiresStudio: true,
  },
  { description: "goToAgents", keys: ["g", "a"], href: "/agents" },
  {
    description: "goToConnectors",
    keys: ["g", "c"],
    href: "/settings/connectors",
  },
  {
    description: "goToPersonalization",
    keys: ["g", "p"],
    href: "/settings/personalization",
  },
];

export type ChordKeyEvent = {
  key: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  /** True when typing in an input/textarea/contenteditable */
  isEditableTarget?: boolean;
};

export type ChordAction =
  | { type: "arm" }
  | { type: "navigate"; href: string }
  | { type: "cancel" }
  | { type: "none" };

/**
 * Pure chord state machine. The caller owns the armed flag + timeout:
 * - "arm"      → start (or restart) the chord window
 * - "navigate" → push the href and disarm
 * - "cancel"   → disarm
 * - "none"     → not chord-related, do nothing
 */
export const resolveChordKey = (
  armed: boolean,
  event: ChordKeyEvent,
  opts?: { canSeeStudio?: boolean },
): ChordAction => {
  const hasModifier = !!(
    event.metaKey ||
    event.ctrlKey ||
    event.altKey ||
    event.shiftKey
  );
  const key = event.key?.toLowerCase() ?? "";

  if (!armed) {
    if (event.isEditableTarget) return { type: "none" };
    if (key === "g" && !hasModifier) return { type: "arm" };
    return { type: "none" };
  }

  // Armed: any unusable key cancels the window.
  if (event.isEditableTarget) return { type: "cancel" };
  if (event.key === "Escape") return { type: "cancel" };
  if (hasModifier) return { type: "cancel" };
  // Pressing "g" again restarts the window (Linear behavior).
  if (key === "g") return { type: "arm" };

  const chord = NavigationChords.find((c) => c.keys[1] === key);
  if (!chord) return { type: "cancel" };
  if (chord.requiresStudio && !opts?.canSeeStudio) return { type: "cancel" };
  return { type: "navigate", href: chord.href };
};

export const isShortcutEvent = (
  event: KeyboardEvent,
  { shortcut }: Shortcut,
) => {
  // A shortcut with no key at all can never match (guards chord entries
  // and malformed definitions from matching every keydown).
  if (!shortcut.key && !shortcut.backspace) return false;

  if (shortcut.command && !event.metaKey && !event.ctrlKey) return false;

  if (shortcut.shift && !event.shiftKey) return false;

  if (shortcut.key && shortcut.key?.toLowerCase() !== event.key?.toLowerCase())
    return false;

  if (shortcut.backspace && event.key?.toLowerCase() !== "backspace")
    return false;

  return true;
};
export const getShortcutKeyList = ({ shortcut }: Shortcut): string[] => {
  const keys: string[] = [];
  if (shortcut.command) {
    keys.push("⌘");
  }
  if (shortcut.shift) {
    keys.push("⇧");
  }
  if (shortcut.key) {
    keys.push(shortcut.key);
  }
  if (shortcut.backspace) {
    keys.push("⌫");
  }
  return keys;
};
