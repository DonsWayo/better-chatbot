/**
 * Per-team guardrail policies.
 *
 * Teams can have "strict", "standard", or "permissive" postures.
 * Each posture controls which pattern groups are enabled and what
 * the action is on a match (redact | block | warn | off).
 *
 * The default policy is "standard". Admins can override per-team
 * via the AsafeTeamTable.guardrailPolicy column (future: DB-driven).
 * For now, policies are code-defined; no DB lookup is needed until Wave 4+.
 */

export type GuardrailAction = "redact" | "block" | "warn" | "off";
export type GuardrailPosture = "strict" | "standard" | "permissive";

export interface GuardrailPolicy {
  posture: GuardrailPosture;
  pii: GuardrailAction;
  secrets: GuardrailAction;
  injection: GuardrailAction;
  /** Max prompt length before guardrails truncate to avoid token bombs */
  maxInputChars: number;
  /** Output safety: strip anything that looks like a system-prompt leak */
  outputLeakProtection: boolean;
}

const POLICIES: Record<GuardrailPosture, GuardrailPolicy> = {
  strict: {
    posture: "strict",
    pii: "block",
    secrets: "block",
    injection: "block",
    maxInputChars: 20_000,
    outputLeakProtection: true,
  },
  standard: {
    posture: "standard",
    pii: "redact",
    secrets: "block",
    injection: "block",
    maxInputChars: 50_000,
    outputLeakProtection: true,
  },
  permissive: {
    posture: "permissive",
    pii: "warn",
    secrets: "redact",
    injection: "warn",
    maxInputChars: 100_000,
    outputLeakProtection: false,
  },
};

/** Resolve a policy for a team. teamPolicy is the string stored on the team row. */
export function resolvePolicy(teamPolicy?: string | null): GuardrailPolicy {
  if (teamPolicy === "strict" || teamPolicy === "permissive") {
    return POLICIES[teamPolicy];
  }
  return POLICIES.standard;
}
