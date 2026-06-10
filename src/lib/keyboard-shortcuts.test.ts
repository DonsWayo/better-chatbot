import { describe, expect, it } from "vitest";
import {
  CHORD_TIMEOUT_MS,
  type ChordKeyEvent,
  NavigationChords,
  type Shortcut,
  Shortcuts,
  getShortcutKeyList,
  isShortcutEvent,
  resolveChordKey,
} from "./keyboard-shortcuts";

const makeKeyboardEvent = (overrides: Partial<KeyboardEvent>): KeyboardEvent =>
  ({
    key: "",
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    ...overrides,
  }) as KeyboardEvent;

describe("Shortcuts", () => {
  it("has openNewChat shortcut defined", () => {
    expect(Shortcuts.openNewChat).toBeDefined();
    expect(Shortcuts.openNewChat.shortcut.command).toBe(true);
    expect(Shortcuts.openNewChat.shortcut.shift).toBe(true);
    expect(Shortcuts.openNewChat.shortcut.key).toBe("O");
  });

  it("has toggleTemporaryChat shortcut", () => {
    expect(Shortcuts.toggleTemporaryChat.shortcut.command).toBe(true);
    expect(Shortcuts.toggleTemporaryChat.shortcut.key).toBe("K");
  });

  it("has deleteThread shortcut (backspace based)", () => {
    expect(Shortcuts.deleteThread.shortcut.backspace).toBe(true);
    expect(Shortcuts.deleteThread.shortcut.shift).toBe(true);
  });

  it("has 10 shortcuts defined", () => {
    expect(Object.keys(Shortcuts)).toHaveLength(10);
  });

  it("has openPersonalization shortcut (Cmd+Shift+L, ex Chat Preferences)", () => {
    expect(Shortcuts.openPersonalization.shortcut.command).toBe(true);
    expect(Shortcuts.openPersonalization.shortcut.shift).toBe(true);
    expect(Shortcuts.openPersonalization.shortcut.key).toBe("L");
  });

  it("all shortcuts have description", () => {
    for (const s of Object.values(Shortcuts)) {
      expect(s.description).toBeDefined();
      expect(s.description!.length).toBeGreaterThan(0);
    }
  });
});

describe("isShortcutEvent", () => {
  it("returns true when command key matches (metaKey)", () => {
    const event = makeKeyboardEvent({ metaKey: true, key: "o" });
    const shortcut: Shortcut = { shortcut: { command: true, key: "O" } };
    expect(isShortcutEvent(event, shortcut)).toBe(true);
  });

  it("returns true when command key matches (ctrlKey)", () => {
    const event = makeKeyboardEvent({ ctrlKey: true, key: "o" });
    const shortcut: Shortcut = { shortcut: { command: true, key: "O" } };
    expect(isShortcutEvent(event, shortcut)).toBe(true);
  });

  it("returns false when command is required but not held", () => {
    const event = makeKeyboardEvent({ key: "o" });
    const shortcut: Shortcut = { shortcut: { command: true, key: "O" } };
    expect(isShortcutEvent(event, shortcut)).toBe(false);
  });

  it("returns false when shift is required but not held", () => {
    const event = makeKeyboardEvent({ metaKey: true, key: "o" });
    const shortcut: Shortcut = {
      shortcut: { command: true, shift: true, key: "O" },
    };
    expect(isShortcutEvent(event, shortcut)).toBe(false);
  });

  it("returns true when both command and shift are held", () => {
    const event = makeKeyboardEvent({
      metaKey: true,
      shiftKey: true,
      key: "o",
    });
    const shortcut: Shortcut = {
      shortcut: { command: true, shift: true, key: "O" },
    };
    expect(isShortcutEvent(event, shortcut)).toBe(true);
  });

  it("returns true for backspace shortcut", () => {
    const event = makeKeyboardEvent({ shiftKey: true, key: "Backspace" });
    const shortcut: Shortcut = { shortcut: { backspace: true, shift: true } };
    expect(isShortcutEvent(event, shortcut)).toBe(true);
  });

  it("returns false when key does not match", () => {
    const event = makeKeyboardEvent({ metaKey: true, key: "x" });
    const shortcut: Shortcut = { shortcut: { command: true, key: "O" } };
    expect(isShortcutEvent(event, shortcut)).toBe(false);
  });

  it("key comparison is case-insensitive", () => {
    const event = makeKeyboardEvent({ metaKey: true, key: "O" });
    const shortcut: Shortcut = { shortcut: { command: true, key: "o" } };
    expect(isShortcutEvent(event, shortcut)).toBe(true);
  });

  it("openNewChat triggers on Cmd+Shift+O", () => {
    const event = makeKeyboardEvent({
      metaKey: true,
      shiftKey: true,
      key: "o",
    });
    expect(isShortcutEvent(event, Shortcuts.openNewChat)).toBe(true);
  });

  it("openNewChat does not trigger on Cmd+O alone", () => {
    const event = makeKeyboardEvent({ metaKey: true, key: "o" });
    expect(isShortcutEvent(event, Shortcuts.openNewChat)).toBe(false);
  });
});

describe("getShortcutKeyList", () => {
  it("returns ⌘ for command shortcuts", () => {
    const list = getShortcutKeyList({ shortcut: { command: true, key: "O" } });
    expect(list).toContain("⌘");
  });

  it("returns ⇧ for shift shortcuts", () => {
    const list = getShortcutKeyList({ shortcut: { shift: true, key: "S" } });
    expect(list).toContain("⇧");
  });

  it("returns ⌫ for backspace shortcuts", () => {
    const list = getShortcutKeyList({ shortcut: { backspace: true } });
    expect(list).toContain("⌫");
  });

  it("returns all modifiers for openNewChat (⌘ ⇧ O)", () => {
    const list = getShortcutKeyList(Shortcuts.openNewChat);
    expect(list).toContain("⌘");
    expect(list).toContain("⇧");
    expect(list).toContain("O");
  });

  it("returns empty array for shortcut with no keys", () => {
    const list = getShortcutKeyList({ shortcut: {} });
    expect(list).toEqual([]);
  });
});

const chordKey = (
  k: string,
  rest: Partial<ChordKeyEvent> = {},
): ChordKeyEvent => ({
  key: k,
  ...rest,
});

describe("resolveChordKey — arming", () => {
  it("arms on a bare g keypress", () => {
    expect(resolveChordKey(false, chordKey("g"))).toEqual({ type: "arm" });
  });

  it("arms on uppercase G (key value only, no shift state)", () => {
    expect(resolveChordKey(false, chordKey("G"))).toEqual({ type: "arm" });
  });

  it("does not arm when a modifier is held", () => {
    expect(resolveChordKey(false, chordKey("g", { metaKey: true }))).toEqual({
      type: "none",
    });
    expect(resolveChordKey(false, chordKey("g", { ctrlKey: true }))).toEqual({
      type: "none",
    });
    expect(resolveChordKey(false, chordKey("g", { altKey: true }))).toEqual({
      type: "none",
    });
    expect(resolveChordKey(false, chordKey("g", { shiftKey: true }))).toEqual({
      type: "none",
    });
  });

  it("does not arm while typing in an editable target", () => {
    expect(
      resolveChordKey(false, chordKey("g", { isEditableTarget: true })),
    ).toEqual({ type: "none" });
  });

  it("ignores non-g keys while disarmed", () => {
    expect(resolveChordKey(false, chordKey("h"))).toEqual({ type: "none" });
    expect(resolveChordKey(false, chordKey("Escape"))).toEqual({
      type: "none",
    });
  });
});

describe("resolveChordKey — second key", () => {
  it("navigates for every registered non-gated chord", () => {
    expect(resolveChordKey(true, chordKey("h"))).toEqual({
      type: "navigate",
      href: "/",
    });
    expect(resolveChordKey(true, chordKey("i"))).toEqual({
      type: "navigate",
      href: "/inbox",
    });
    expect(resolveChordKey(true, chordKey("a"))).toEqual({
      type: "navigate",
      href: "/agents",
    });
    expect(resolveChordKey(true, chordKey("c"))).toEqual({
      type: "navigate",
      href: "/settings/connectors",
    });
    expect(resolveChordKey(true, chordKey("p"))).toEqual({
      type: "navigate",
      href: "/settings/personalization",
    });
  });

  it("cancels on Escape", () => {
    expect(resolveChordKey(true, chordKey("Escape"))).toEqual({
      type: "cancel",
    });
  });

  it("cancels on an unknown second key", () => {
    expect(resolveChordKey(true, chordKey("z"))).toEqual({ type: "cancel" });
  });

  it("cancels when a modifier is held on the second key", () => {
    expect(resolveChordKey(true, chordKey("h", { metaKey: true }))).toEqual({
      type: "cancel",
    });
    expect(resolveChordKey(true, chordKey("h", { shiftKey: true }))).toEqual({
      type: "cancel",
    });
  });

  it("cancels when focus moved into an editable target", () => {
    expect(
      resolveChordKey(true, chordKey("h", { isEditableTarget: true })),
    ).toEqual({ type: "cancel" });
  });

  it("re-arms (restarts the window) when g is pressed again", () => {
    expect(resolveChordKey(true, chordKey("g"))).toEqual({ type: "arm" });
  });
});

describe("resolveChordKey — studio role gating", () => {
  it("navigates to /studio when the user can see Studio", () => {
    expect(
      resolveChordKey(true, chordKey("s"), { canSeeStudio: true }),
    ).toEqual({
      type: "navigate",
      href: "/studio",
    });
  });

  it("cancels g+s when the user cannot see Studio", () => {
    expect(
      resolveChordKey(true, chordKey("s"), { canSeeStudio: false }),
    ).toEqual({ type: "cancel" });
    expect(resolveChordKey(true, chordKey("s"))).toEqual({ type: "cancel" });
  });
});

describe("NavigationChords registry", () => {
  it("all chords start with g and have unique second keys", () => {
    const seconds = NavigationChords.map((c) => c.keys[1]);
    expect(NavigationChords.every((c) => c.keys[0] === "g")).toBe(true);
    expect(new Set(seconds).size).toBe(seconds.length);
  });

  it("second keys never collide with the g prefix", () => {
    expect(NavigationChords.some((c) => c.keys[1] === "g")).toBe(false);
  });

  it("chord window is 1.5 seconds", () => {
    expect(CHORD_TIMEOUT_MS).toBe(1500);
  });

  it("every chord has an i18n description", () => {
    for (const chord of NavigationChords) {
      expect(chord.description.length).toBeGreaterThan(0);
    }
  });
});

describe("isShortcutEvent hardening (chord entries)", () => {
  it("a shortcut without key/backspace never matches any event", () => {
    const event = makeKeyboardEvent({ key: "h" });
    expect(isShortcutEvent(event, { shortcut: {} })).toBe(false);
  });
});
