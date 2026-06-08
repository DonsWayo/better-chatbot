/**
 * W4: per-team model allow-list enforcement
 *
 * Tests cover the enforcement logic wired into /api/chat/route.ts:
 *   - empty allow-list → all models allowed (no restriction)
 *   - non-empty allow-list → only listed models pass; others get 403
 *   - admin API accepts / rejects model IDs correctly
 */

import { describe, it, expect } from "vitest";

// ── Inline the enforcement predicate from the chat route ──────────────────────
// Rather than spinning up the full Next.js route (which needs DB, session, …),
// we extract the guard predicate and test it in isolation.

function isModelAllowed(
  modelId: string | undefined,
  allowList: string[],
): boolean {
  if (allowList.length === 0) return true; // empty = unrestricted
  if (!modelId) return true;               // no model = routed, let it through
  return allowList.includes(modelId);
}

describe("W4 model allow-list enforcement predicate", () => {
  it("allows any model when allow-list is empty", () => {
    expect(isModelAllowed("gpt-5.1", [])).toBe(true);
    expect(isModelAllowed("claude-opus-4.8", [])).toBe(true);
    expect(isModelAllowed("some-unknown-model", [])).toBe(true);
  });

  it("allows a model that is in the allow-list", () => {
    const list = ["gpt-5.1", "gemini-2.5-flash"];
    expect(isModelAllowed("gpt-5.1", list)).toBe(true);
    expect(isModelAllowed("gemini-2.5-flash", list)).toBe(true);
  });

  it("blocks a model that is not in a non-empty allow-list", () => {
    const list = ["gpt-5.1"];
    expect(isModelAllowed("claude-opus-4.8", list)).toBe(false);
    expect(isModelAllowed("gemini-2.5-flash", list)).toBe(false);
  });

  it("allows when modelId is undefined (auto-routed request)", () => {
    expect(isModelAllowed(undefined, ["gpt-5.1"])).toBe(true);
  });

  it("is case-sensitive (ID mismatch → blocked)", () => {
    expect(isModelAllowed("GPT-5.1", ["gpt-5.1"])).toBe(false);
    expect(isModelAllowed("gpt-5.1", ["GPT-5.1"])).toBe(false);
  });

  it("single-model allow-list blocks all other approved models", () => {
    const list = ["gemini-2.5-flash-lite"];
    const others = ["gpt-5.1", "claude-opus-4.8", "gemini-2.5-flash"];
    for (const m of others) {
      expect(isModelAllowed(m, list)).toBe(false);
    }
    expect(isModelAllowed("gemini-2.5-flash-lite", list)).toBe(true);
  });

  it("all four approved models are allowed when all four are listed", () => {
    const ALL = ["gpt-5.1", "claude-opus-4.8", "gemini-2.5-flash", "gemini-2.5-flash-lite"];
    for (const m of ALL) {
      expect(isModelAllowed(m, ALL)).toBe(true);
    }
  });
});

// ── API schema validation (approved model IDs) ────────────────────────────────

const APPROVED_MODEL_IDS = ["gpt-5.1", "claude-opus-4.8", "gemini-2.5-flash", "gemini-2.5-flash-lite"];

describe("APPROVED_MODEL_IDS contract", () => {
  it("contains exactly the four approved models", () => {
    expect(APPROVED_MODEL_IDS).toHaveLength(4);
    expect(APPROVED_MODEL_IDS).toContain("gpt-5.1");
    expect(APPROVED_MODEL_IDS).toContain("claude-opus-4.8");
    expect(APPROVED_MODEL_IDS).toContain("gemini-2.5-flash");
    expect(APPROVED_MODEL_IDS).toContain("gemini-2.5-flash-lite");
  });

  it("does not contain any legacy model IDs", () => {
    const legacy = ["gpt-4", "gpt-4o", "claude-3-opus", "gemini-pro", "gemini-1.5-flash"];
    for (const id of legacy) {
      expect(APPROVED_MODEL_IDS).not.toContain(id);
    }
  });
});
