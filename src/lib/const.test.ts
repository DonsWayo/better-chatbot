import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  PROMPT_PASTE_MAX_LENGTH,
  COOKIE_KEY_SIDEBAR_STATE,
  COOKIE_KEY_LOCALE,
  BASE_THEMES,
  SUPPORTED_LOCALES,
  BACKGROUND_COLORS,
  EMOJI_DATA,
  OAUTH_REQUIRED_CODE,
  BASE_URL,
} from "./const";

describe("const — PROMPT_PASTE_MAX_LENGTH", () => {
  it("is a positive number", () => {
    expect(PROMPT_PASTE_MAX_LENGTH).toBeGreaterThan(0);
  });

  it("is a number", () => {
    expect(typeof PROMPT_PASTE_MAX_LENGTH).toBe("number");
  });
});

describe("const — cookie keys", () => {
  it("COOKIE_KEY_SIDEBAR_STATE is a non-empty string", () => {
    expect(typeof COOKIE_KEY_SIDEBAR_STATE).toBe("string");
    expect(COOKIE_KEY_SIDEBAR_STATE.length).toBeGreaterThan(0);
  });

  it("COOKIE_KEY_LOCALE is a non-empty string", () => {
    expect(typeof COOKIE_KEY_LOCALE).toBe("string");
    expect(COOKIE_KEY_LOCALE.length).toBeGreaterThan(0);
  });

  it("cookie keys are distinct", () => {
    expect(COOKIE_KEY_SIDEBAR_STATE).not.toBe(COOKIE_KEY_LOCALE);
  });
});

describe("const — BASE_THEMES", () => {
  it("is an array", () => {
    expect(Array.isArray(BASE_THEMES)).toBe(true);
  });

  it("has at least one theme", () => {
    expect(BASE_THEMES.length).toBeGreaterThan(0);
  });

  it("contains 'default' theme", () => {
    expect(BASE_THEMES).toContain("default");
  });

  it("all entries are non-empty strings", () => {
    for (const theme of BASE_THEMES) {
      expect(typeof theme).toBe("string");
      expect(theme.length).toBeGreaterThan(0);
    }
  });

  it("no duplicates", () => {
    expect(new Set(BASE_THEMES).size).toBe(BASE_THEMES.length);
  });
});

describe("const — SUPPORTED_LOCALES", () => {
  it("is an array", () => {
    expect(Array.isArray(SUPPORTED_LOCALES)).toBe(true);
  });

  it("has at least one locale", () => {
    expect(SUPPORTED_LOCALES.length).toBeGreaterThan(0);
  });

  it("contains English locale", () => {
    const en = SUPPORTED_LOCALES.find((l) => l.code === "en");
    expect(en).toBeDefined();
  });

  it("each locale has code and name", () => {
    for (const locale of SUPPORTED_LOCALES) {
      expect(typeof locale.code).toBe("string");
      expect(locale.code.length).toBeGreaterThan(0);
      expect(typeof locale.name).toBe("string");
      expect(locale.name.length).toBeGreaterThan(0);
    }
  });

  it("locale codes are unique", () => {
    const codes = SUPPORTED_LOCALES.map((l) => l.code);
    expect(new Set(codes).size).toBe(codes.length);
  });
});

describe("const — BACKGROUND_COLORS", () => {
  it("is an array", () => {
    expect(Array.isArray(BACKGROUND_COLORS)).toBe(true);
  });

  it("all entries are non-empty strings", () => {
    for (const c of BACKGROUND_COLORS) {
      expect(typeof c).toBe("string");
      expect(c.length).toBeGreaterThan(0);
    }
  });
});

describe("const — EMOJI_DATA", () => {
  it("is an array", () => {
    expect(Array.isArray(EMOJI_DATA)).toBe(true);
  });

  it("contains URL strings", () => {
    for (const url of EMOJI_DATA) {
      expect(typeof url).toBe("string");
      expect(url.startsWith("https://")).toBe(true);
    }
  });
});

describe("const — OAUTH_REQUIRED_CODE", () => {
  it("is a non-empty string", () => {
    expect(typeof OAUTH_REQUIRED_CODE).toBe("string");
    expect(OAUTH_REQUIRED_CODE.length).toBeGreaterThan(0);
  });
});

describe("const — BASE_URL", () => {
  it("is a non-empty string", () => {
    expect(typeof BASE_URL).toBe("string");
    expect(BASE_URL.length).toBeGreaterThan(0);
  });

  it("does not end with a trailing slash", () => {
    expect(BASE_URL.endsWith("/")).toBe(false);
  });

  it("starts with http:// or https://", () => {
    expect(BASE_URL.startsWith("http://") || BASE_URL.startsWith("https://")).toBe(true);
  });
});
