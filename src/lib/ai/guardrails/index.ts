import type { LanguageModel } from "ai";

/**
 * Wave 7 stub (ADR-0008): guardrails / DLP wrapper.
 * Currently a pass-through. Wave 7 will implement:
 *  - Input scanning: prompt injection, PII/data-classification rules
 *  - Output scanning: response DLP, content policy
 *  - Block/redact/alert modes
 * Enable by wrapping: wrapWithGuardrails(model, session)
 */
export function wrapWithGuardrails(model: LanguageModel, _sessionUserId: string): LanguageModel {
  return model; // pass-through until Wave 7
}

export const GUARDRAILS_ENABLED = process.env.ASAFE_GUARDRAILS_ENABLED === "true";
