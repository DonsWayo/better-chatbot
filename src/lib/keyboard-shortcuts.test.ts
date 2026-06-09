import { describe, expect, it } from "vitest";
import {
  Shortcuts,
  isShortcutEvent,
  getShortcutKeyList,
  type Shortcut,
} from "./keyboard-shortcuts";

const makeEvent = (overrides: Partial<KeyboardEvent>): KeyboardEvent =>
  ({
    key: "",
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    ...overrides,
  }) as KeyboardEvent;

describe("Shortcuts registry", () => {
  it("is an object", () => {
    expect(typeof Shortcuts).toBe("object");
    expect(Shortcuts).not.toBeNull();
  });

  it("openNewChat shortcut exists", () => {
    expect(Shortcuts.openNewChat).toBeDefined();
  });

  it("toggleSidebar shortcut exists", () => {
    expect(Shortcuts.toggleSidebar).toBeDefined();
  });

  it("each shortcut has a shortcut property", () => {
    for (const key of Object.keys(Shortcuts)) {
      const s = Shortcuts[key as keyof typeof Shortcuts];
      expect(s).toHaveProperty("shortcut");
    }
  });

  it("at least 5 shortcuts are registered", () => {
    expect(Object.keys(Shortcuts).length).toBeGreaterThanOrEqual(5);
  });
});

describe("isShortcutEvent — matching", () => {
  it("matches Cmd+O (openNewChat) on macOS metaKey", () => {
    const event = makeEvent({ key: "O", metaKey: true, shiftKey: true });
    expect(isShortcutEvent(event, Shortcuts.openNewChat)).toBe(true);
  });

  it("matches Ctrl+O (openNewChat) on Windows ctrlKey", () => {
    const event = makeEvent({ key: "O", ctrlKey: true, shiftKey: true });
    expect(isShortcutEvent(event, Shortcuts.openNewChat)).toBe(true);
  });

  it("rejects when command modifier is missing", () => {
    const event = makeEvent({ key: "O", shiftKey: true });
    expect(isShortcutEvent(event, Shortcuts.openNewChat)).toBe(false);
  });

  it("rejects when shift is missing but required", () => {
    const event = makeEvent({ key: "O", metaKey: true });
    expect(isShortcutEvent(event, Shortcuts.openNewChat)).toBe(false);
  });

  it("is case-insensitive for key matching", () => {
    const event = makeEvent({ key: "o", metaKey: true, shiftKey: true });
    expect(isShortcutEvent(event, Shortcuts.openNewChat)).toBe(true);
  });

  it("matches deleteThread with shift+backspace", () => {
    const event = makeEvent({ key: "Backspace", shiftKey: true });
    expect(isShortcutEvent(event, Shortcuts.deleteThread)).toBe(true);
  });

  it("rejects deleteThread without shift", () => {
    const event = makeEvent({ key: "Backspace" });
    expect(isShortcutEvent(event, Shortcuts.deleteThread)).toBe(false);
  });
});

describe("isShortcutEvent — return type invariants", () => {
  it("always returns a boolean", () => {
    const event = makeEvent({ key: "X" });
    for (const s of Object.values(Shortcuts)) {
      expect(typeof isShortcutEvent(event, s)).toBe("boolean");
    }
  });
});

describe("getShortcutKeyList", () => {
  it("returns an array", () => {
    expect(Array.isArray(getShortcutKeyList(Shortcuts.openNewChat))).toBe(true);
  });

  it("includes ⌘ for command shortcuts", () => {
    expect(getShortcutKeyList(Shortcuts.openNewChat)).toContain("⌘");
  });

  it("includes ⇧ for shift shortcuts", () => {
    expect(getShortcutKeyList(Shortcuts.openNewChat)).toContain("⇧");
  });

  it("includes ⌫ for backspace shortcuts", () => {
    expect(getShortcutKeyList(Shortcuts.deleteThread)).toContain("⌫");
  });

  it("does not include ⌘ for non-command shortcut", () => {
    const backspaceOnly: Shortcut = { shortcut: { backspace: true } };
    expect(getShortcutKeyList(backspaceOnly)).not.toContain("⌘");
  });

  it("all entries are non-empty strings", () => {
    for (const s of Object.values(Shortcuts)) {
      const keys = getShortcutKeyList(s);
      for (const k of keys) {
        expect(typeof k).toBe("string");
        expect(k.length).toBeGreaterThan(0);
      }
    }
  });
});

describe("getShortcutKeyList — return type invariants", () => {
  it("always returns an array", () => {
    for (const s of Object.values(Shortcuts)) {
      expect(Array.isArray(getShortcutKeyList(s))).toBe(true);
    }
  });

  it("returns empty array for empty shortcut", () => {
    const empty: Shortcut = { shortcut: {} };
    expect(getShortcutKeyList(empty)).toEqual([]);
  });
});
