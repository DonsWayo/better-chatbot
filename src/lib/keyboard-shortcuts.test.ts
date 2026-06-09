import { describe, it, expect } from "vitest";
import {
  Shortcuts,
  isShortcutEvent,
  getShortcutKeyList,
  type Shortcut,
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

  it("has 9 shortcuts defined", () => {
    expect(Object.keys(Shortcuts)).toHaveLength(9);
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
    const shortcut: Shortcut = { shortcut: { command: true, shift: true, key: "O" } };
    expect(isShortcutEvent(event, shortcut)).toBe(false);
  });

  it("returns true when both command and shift are held", () => {
    const event = makeKeyboardEvent({ metaKey: true, shiftKey: true, key: "o" });
    const shortcut: Shortcut = { shortcut: { command: true, shift: true, key: "O" } };
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
    const event = makeKeyboardEvent({ metaKey: true, shiftKey: true, key: "o" });
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
