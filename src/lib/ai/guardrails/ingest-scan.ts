/**
 * Knowledge-ingestion guardrail scan (W7 GA gate, ADR-0008).
 *
 * Documents ingested into the RAG knowledge base are later injected into
 * system prompts as <knowledge_base> context — a poisoned document is a
 * persistent prompt-injection vector that fires on EVERY retrieval. Scanning
 * once at ingest time is far cheaper than scanning every retrieval.
 *
 * Posture: WARN + NEUTRALIZE, never block.
 * Ingestion is an admin-curated batch path; a hard block would silently fail
 * document onboarding for one bad paragraph in a 200-page PDF. Instead:
 *
 * - prompt-injection patterns are STRIPPED (replaced with their mask) and a
 *   warning is recorded in the ingest response;
 * - secrets are always REDACTED (a credential in the KB would otherwise be
 *   served to every user who triggers retrieval) — block downgrades to redact;
 * - PII follows the org policy action (standard ⇒ redact), with block also
 *   downgraded to redact for the same no-silent-failure reason.
 *
 * Pure module — no DB/metrics imports; safe to call from route handlers.
 */

import {
  INJECTION_PATTERNS,
  PII_PATTERNS,
  type Pattern,
  SECRET_PATTERNS,
} from "./patterns";
import { type GuardrailAction, resolvePolicy } from "./policies";
import type { GuardrailFiring } from "./scan";

export interface IngestScanResult {
  /** Sanitized text — feed THIS to the chunk/embed pipeline. */
  text: string;
  /** Human-readable warnings to surface in the ingest response. */
  warnings: string[];
  firings: GuardrailFiring[];
}

/** Ingest never blocks: block → redact, everything else as-is. */
function softenAction(action: GuardrailAction): GuardrailAction {
  return action === "block" ? "redact" : action;
}

function apply(
  text: string,
  patterns: Pattern[],
  category: GuardrailFiring["category"],
  action: GuardrailAction,
  warningPrefix: string,
  out: { warnings: string[]; firings: GuardrailFiring[] },
): string {
  if (action === "off") return text;
  let current = text;
  for (const p of patterns) {
    p.regex.lastIndex = 0;
    const matches = current.match(p.regex);
    if (!matches || matches.length === 0) continue;
    out.firings.push({
      patternId: p.id,
      label: p.label,
      category,
      action,
      matchCount: matches.length,
    });
    out.warnings.push(
      `${warningPrefix}: ${p.label} (${matches.length} match${matches.length === 1 ? "" : "es"})${
        action === "redact" ? " — redacted" : ""
      }`,
    );
    if (action === "redact") {
      p.regex.lastIndex = 0;
      current = current.replace(p.regex, p.mask);
    }
  }
  return current;
}

/**
 * Scan extracted document text before it enters the knowledge base.
 * `policyName` is the org/team guardrail posture; omitted ⇒ org default
 * ("standard"). Returns sanitized text + warnings — never throws, never blocks.
 */
export function scanIngestText(
  text: string,
  policyName?: string | null,
): IngestScanResult {
  if (process.env.ASAFE_GUARDRAILS_ENABLED === "false") {
    return { text, warnings: [], firings: [] };
  }

  const policy = resolvePolicy(policyName);
  const out: { warnings: string[]; firings: GuardrailFiring[] } = {
    warnings: [],
    firings: [],
  };

  let current = text;
  // Injection patterns are always stripped, regardless of posture — a stored
  // injection re-fires on every retrieval, so "warn" is not enough here.
  current = apply(
    current,
    INJECTION_PATTERNS,
    "injection",
    "redact",
    "Prompt-injection pattern neutralized",
    out,
  );
  current = apply(
    current,
    SECRET_PATTERNS,
    "secret",
    softenAction(policy.secrets),
    "Secret/credential detected",
    out,
  );
  current = apply(
    current,
    PII_PATTERNS,
    "pii",
    softenAction(policy.pii),
    "PII detected",
    out,
  );

  return { text: current, warnings: out.warnings, firings: out.firings };
}
