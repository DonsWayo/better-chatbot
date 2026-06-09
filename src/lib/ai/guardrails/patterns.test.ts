import { describe, it, expect } from "vitest";
import { PII_PATTERNS, SECRET_PATTERNS } from "./patterns";

function matches(pattern: RegExp, text: string): string[] {
  const re = new RegExp(pattern.source, pattern.flags);
  return text.match(re) ?? [];
}

describe("PII_PATTERNS", () => {
  it("detects email addresses", () => {
    const p = PII_PATTERNS.find((p) => p.id === "email")!;
    expect(matches(p.regex, "Contact us at user@example.com for help")).toHaveLength(1);
    expect(matches(p.regex, "no email here")).toHaveLength(0);
  });

  it("detects Spanish phone numbers", () => {
    const p = PII_PATTERNS.find((p) => p.id === "phone_es")!;
    expect(matches(p.regex, "Call me at 612345678")).toHaveLength(1);
    expect(matches(p.regex, "Mobile: 712 345 678")).toHaveLength(1);
  });

  it("detects international phone numbers", () => {
    const p = PII_PATTERNS.find((p) => p.id === "phone_intl")!;
    expect(matches(p.regex, "+447911123456")).toHaveLength(1);
  });

  it("detects Spanish NIF/NIE", () => {
    const p = PII_PATTERNS.find((p) => p.id === "nif_nie")!;
    expect(matches(p.regex, "NIF: 12345678Z")).toHaveLength(1);
    expect(matches(p.regex, "NIE: X1234567L")).toHaveLength(1);
  });

  it("detects IBANs", () => {
    const p = PII_PATTERNS.find((p) => p.id === "iban")!;
    expect(matches(p.regex, "IBAN: ES9121000418450200051332")).toHaveLength(1);
  });

  it("detects IPv4 addresses", () => {
    const p = PII_PATTERNS.find((p) => p.id === "ip_v4")!;
    expect(matches(p.regex, "Server at 192.168.1.1 is down")).toHaveLength(1);
    expect(matches(p.regex, "no IP here")).toHaveLength(0);
  });

  it("all patterns have unique ids and non-empty masks", () => {
    const ids = new Set<string>();
    for (const p of PII_PATTERNS) {
      expect(ids.has(p.id), `duplicate id: ${p.id}`).toBe(false);
      ids.add(p.id);
      expect(p.mask.length).toBeGreaterThan(0);
    }
  });
});

describe("SECRET_PATTERNS", () => {
  it("detects OpenAI API keys", () => {
    const p = SECRET_PATTERNS.find((p) => p.id === "openai_key")!;
    expect(matches(p.regex, "key: sk-abcdefghijklmnopqrstuvwxyz1234")).toHaveLength(1);
    expect(matches(p.regex, "not a key")).toHaveLength(0);
  });

  it("all secret patterns have unique ids and block-style masks", () => {
    const ids = new Set<string>();
    for (const p of SECRET_PATTERNS) {
      expect(ids.has(p.id), `duplicate id: ${p.id}`).toBe(false);
      ids.add(p.id);
      expect(p.mask).toContain("[SECRET:");
    }
  });

  it("covers OpenRouter API keys", () => {
    const p = SECRET_PATTERNS.find((p) => p.id === "openrouter_key");
    expect(p).toBeDefined();
  });
});
