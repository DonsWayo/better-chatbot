import { PII_PATTERNS, SECRET_PATTERNS, INJECTION_PATTERNS, type Pattern } from "./patterns";
import { type GuardrailAction, type GuardrailPolicy } from "./policies";

export type GuardrailCategory = "pii" | "secret" | "injection";

export interface GuardrailFiring {
  patternId: string;
  label: string;
  category: GuardrailCategory;
  action: GuardrailAction;
  matchCount: number;
}

export interface ScanResult {
  text: string; // processed text (redacted if action=redact, original if warn/off)
  blocked: boolean; // true if any pattern triggered action=block
  blockReason?: string;
  firings: GuardrailFiring[];
}

function applyPatterns(
  text: string,
  patterns: Pattern[],
  category: GuardrailCategory,
  action: GuardrailAction,
  firings: GuardrailFiring[],
): { text: string; blocked: boolean; blockReason?: string } {
  if (action === "off") return { text, blocked: false };

  let current = text;
  let blocked = false;
  let blockReason: string | undefined;

  for (const p of patterns) {
    // Reset lastIndex for global regexes between calls
    p.regex.lastIndex = 0;
    const matches = current.match(p.regex);
    if (!matches || matches.length === 0) continue;

    firings.push({
      patternId: p.id,
      label: p.label,
      category,
      action,
      matchCount: matches.length,
    });

    if (action === "block") {
      blocked = true;
      blockReason = `Guardrail blocked: ${p.label} detected in input.`;
      // Stop on first block — don't continue scanning
      return { text: current, blocked, blockReason };
    }

    if (action === "redact") {
      p.regex.lastIndex = 0;
      current = current.replace(p.regex, p.mask);
    }
    // "warn" — no text change, just record firing
  }

  return { text: current, blocked, blockReason };
}

/** Scan and process a text string according to a guardrail policy. */
export function scanInput(text: string, policy: GuardrailPolicy): ScanResult {
  const firings: GuardrailFiring[] = [];
  let current = text;

  // 1. Length gate
  if (current.length > policy.maxInputChars) {
    current = current.slice(0, policy.maxInputChars);
    firings.push({
      patternId: "max_input_length",
      label: "input truncated to max length",
      category: "pii",
      action: "redact",
      matchCount: 1,
    });
  }

  // 2. Prompt injection (check before PII, injection takes priority)
  {
    const r = applyPatterns(current, INJECTION_PATTERNS, "injection", policy.injection, firings);
    current = r.text;
    if (r.blocked) return { text: current, blocked: true, blockReason: r.blockReason, firings };
  }

  // 3. Secrets (block/redact before sending to provider)
  {
    const r = applyPatterns(current, SECRET_PATTERNS, "secret", policy.secrets, firings);
    current = r.text;
    if (r.blocked) return { text: current, blocked: true, blockReason: r.blockReason, firings };
  }

  // 4. PII
  {
    const r = applyPatterns(current, PII_PATTERNS, "pii", policy.pii, firings);
    current = r.text;
    if (r.blocked) return { text: current, blocked: true, blockReason: r.blockReason, firings };
  }

  return { text: current, blocked: false, firings };
}

/**
 * Scan model output for system-prompt leakage indicators.
 * Used when outputLeakProtection is enabled.
 */
export function scanOutput(text: string): { text: string; leaked: boolean } {
  // Common markers that indicate a system prompt has been echoed back
  const leakMarkers = [
    /You are (an AI assistant|a helpful assistant|Asafe AI)/gi,
    /Your instructions are:/gi,
    /System:\s*You/gi,
    /<system>/gi,
    /\[SYSTEM PROMPT\]/gi,
  ];

  let leaked = false;
  let current = text;

  for (const rx of leakMarkers) {
    if (rx.test(current)) {
      leaked = true;
      rx.lastIndex = 0;
      current = current.replace(rx, "[REDACTED]");
    }
  }

  return { text: current, leaked };
}
