import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MESSAGES_DIR = resolve(__dirname, "../../../messages");

function loadLocale(locale: string): Record<string, unknown> {
  const raw = readFileSync(resolve(MESSAGES_DIR, `${locale}.json`), "utf-8");
  return JSON.parse(raw) as Record<string, unknown>;
}

function getAllKeys(obj: Record<string, unknown>, prefix = ""): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    typeof v === "object" && v !== null
      ? getAllKeys(v as Record<string, unknown>, prefix ? `${prefix}.${k}` : k)
      : [prefix ? `${prefix}.${k}` : k],
  );
}

function getEmptyValueKeys(
  obj: Record<string, unknown>,
  prefix = "",
): string[] {
  return Object.entries(obj).flatMap(([k, v]) => {
    const full = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "object" && v !== null) {
      return getEmptyValueKeys(v as Record<string, unknown>, full);
    }
    return v === "" ? [full] : [];
  });
}

function getNestedValue(
  obj: Record<string, unknown>,
  dotPath: string,
): unknown {
  return dotPath.split(".").reduce<unknown>((acc, key) => {
    if (acc !== null && typeof acc === "object") {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const en = loadLocale("en");
const enKeys = new Set(getAllKeys(en));

const NON_ENGLISH_LOCALES = ["es", "fr", "ja", "ko", "no", "zh"] as const;
type NonEnglishLocale = (typeof NON_ENGLISH_LOCALES)[number];

const localeData: Record<
  NonEnglishLocale,
  Record<string, unknown>
> = Object.fromEntries(
  NON_ENGLISH_LOCALES.map((locale) => [locale, loadLocale(locale)]),
) as Record<NonEnglishLocale, Record<string, unknown>>;

const localeKeys: Record<NonEnglishLocale, Set<string>> = Object.fromEntries(
  NON_ENGLISH_LOCALES.map((locale) => [
    locale,
    new Set(getAllKeys(localeData[locale])),
  ]),
) as Record<NonEnglishLocale, Set<string>>;

// ---------------------------------------------------------------------------
// Suite 1: en.json sanity checks
// ---------------------------------------------------------------------------

describe("en.json (source of truth)", () => {
  it("loads successfully and is a non-empty object", () => {
    expect(en).toBeDefined();
    expect(typeof en).toBe("object");
    expect(Object.keys(en).length).toBeGreaterThan(0);
  });

  it("contains all expected top-level namespaces", () => {
    const expectedNamespaces = [
      "Common",
      "Error",
      "Info",
      "Workflow",
      "Auth",
      "Chat",
      "Layout",
      "Archive",
      "Agent",
      "KeyboardShortcuts",
      "User",
      "Admin",
      "MCP",
      "Runs",
      "Triage",
      "Teamspaces",
      "Memory",
      "Settings",
      "CommandPalette",
      "Studio",
      "Knowledge",
      "Visibility",
      "Tours",
      "Documents",
    ];
    for (const ns of expectedNamespaces) {
      expect(Object.keys(en), `Missing namespace: ${ns}`).toContain(ns);
    }
  });

  it("has a Documents namespace", () => {
    expect(en).toHaveProperty("Documents");
  });

  it("Documents namespace contains createError key", () => {
    const documents = (en as Record<string, Record<string, unknown>>).Documents;
    expect(documents).toHaveProperty("createError");
  });

  it("Documents.createError is a non-empty string", () => {
    const value = getNestedValue(en, "Documents.createError");
    expect(typeof value).toBe("string");
    expect((value as string).length).toBeGreaterThan(0);
  });

  it("has more than 1000 leaf keys total (coverage sanity)", () => {
    expect(enKeys.size).toBeGreaterThan(1000);
  });
});

// ---------------------------------------------------------------------------
// Suite 2: Missing keys — every locale must have all English keys
// ---------------------------------------------------------------------------

describe("i18n key completeness — no missing keys", () => {
  it.each(NON_ENGLISH_LOCALES)(
    "%s: must not be missing any key present in en.json",
    (locale) => {
      const keys = localeKeys[locale];
      const missingKeys = [...enKeys].filter((k) => !keys.has(k));
      expect(
        missingKeys,
        `${locale} is missing ${missingKeys.length} key(s): ${missingKeys.slice(0, 10).join(", ")}`,
      ).toHaveLength(0);
    },
  );

  it.each(NON_ENGLISH_LOCALES)(
    "%s: Documents.createError key must exist",
    (locale) => {
      const data = localeData[locale];
      const value = getNestedValue(data, "Documents.createError");
      expect(value, `${locale} is missing Documents.createError`).toBeDefined();
    },
  );

  it.each(NON_ENGLISH_LOCALES)(
    "%s: Common namespace must be fully covered",
    (locale) => {
      const enCommonKeys = [...enKeys].filter((k) => k.startsWith("Common."));
      const localeCommonKeys = [...localeKeys[locale]].filter((k) =>
        k.startsWith("Common."),
      );
      const missingCommonKeys = enCommonKeys.filter(
        (k) => !localeKeys[locale].has(k),
      );
      expect(
        missingCommonKeys,
        `${locale} missing Common keys: ${missingCommonKeys.join(", ")}`,
      ).toHaveLength(0);
      expect(localeCommonKeys.length).toBeGreaterThanOrEqual(
        enCommonKeys.length,
      );
    },
  );

  it.each(NON_ENGLISH_LOCALES)(
    "%s: Documents namespace must be fully covered",
    (locale) => {
      const enDocKeys = [...enKeys].filter((k) => k.startsWith("Documents."));
      const missingDocKeys = enDocKeys.filter(
        (k) => !localeKeys[locale].has(k),
      );
      expect(
        missingDocKeys,
        `${locale} missing Documents keys: ${missingDocKeys.join(", ")}`,
      ).toHaveLength(0);
    },
  );
});

// ---------------------------------------------------------------------------
// Suite 3: Extra keys — no locale should have keys not in English (drift check)
// ---------------------------------------------------------------------------

describe("i18n key drift — no extra keys beyond English", () => {
  it.each(NON_ENGLISH_LOCALES)(
    "%s: must not have keys absent from en.json",
    (locale) => {
      const keys = localeKeys[locale];
      const extraKeys = [...keys].filter((k) => !enKeys.has(k));
      expect(
        extraKeys,
        `${locale} has ${extraKeys.length} extra key(s) not in en.json: ${extraKeys.slice(0, 10).join(", ")}`,
      ).toHaveLength(0);
    },
  );
});

// ---------------------------------------------------------------------------
// Suite 4: Empty string values — no translation should be blank
// ---------------------------------------------------------------------------

describe("i18n value quality — no empty string values", () => {
  it("en.json has no empty string values", () => {
    const emptyKeys = getEmptyValueKeys(en);
    expect(
      emptyKeys,
      `en.json has ${emptyKeys.length} empty value(s): ${emptyKeys.join(", ")}`,
    ).toHaveLength(0);
  });

  it.each(NON_ENGLISH_LOCALES)(
    "%s: must have no empty string values",
    (locale) => {
      const data = localeData[locale];
      const emptyKeys = getEmptyValueKeys(data);
      expect(
        emptyKeys,
        `${locale} has ${emptyKeys.length} empty value(s): ${emptyKeys.join(", ")}`,
      ).toHaveLength(0);
    },
  );
});

// ---------------------------------------------------------------------------
// Suite 5: Key count symmetry — locales should be in sync with English
// ---------------------------------------------------------------------------

describe("i18n key count symmetry", () => {
  it.each(NON_ENGLISH_LOCALES)(
    "%s: total key count must equal en.json (after drift/missing fix)",
    (locale) => {
      const keys = localeKeys[locale];
      expect(keys.size).toBe(enKeys.size);
    },
  );
});

// ---------------------------------------------------------------------------
// Suite 6: Spot-check critical keys across all locales
// ---------------------------------------------------------------------------

describe("i18n spot-check — critical keys exist in every locale", () => {
  const CRITICAL_KEYS = [
    "Common.cancel",
    "Common.save",
    "Common.delete",
    "Common.error",
    "Common.retry",
    "Auth.SignIn.signIn",
    "Chat.budgetExhausted",
    "Documents.createError",
    "Documents.title",
    "Documents.saving",
    "Documents.saved",
    "Documents.toolbar.bold",
    "Documents.history.title",
    "Documents.comments.title",
    "Documents.ai.improve",
  ];

  it.each(CRITICAL_KEYS)("key '%s' exists in all locales", (key) => {
    for (const locale of NON_ENGLISH_LOCALES) {
      const value = getNestedValue(localeData[locale], key);
      expect(value, `${locale} is missing critical key: ${key}`).toBeDefined();
      expect(typeof value, `${locale}.${key} must be a string`).toBe("string");
      expect(
        (value as string).length,
        `${locale}.${key} must not be empty`,
      ).toBeGreaterThan(0);
    }
  });
});
