import { describe, it, expect } from "vitest";
import { resolvePolicy } from "./policies";

describe("resolvePolicy", () => {
  it("returns standard policy by default", () => {
    const policy = resolvePolicy();
    expect(policy.posture).toBe("standard");
  });

  it("returns standard for null or undefined", () => {
    expect(resolvePolicy(null).posture).toBe("standard");
    expect(resolvePolicy(undefined).posture).toBe("standard");
  });

  it("returns strict policy when requested", () => {
    const policy = resolvePolicy("strict");
    expect(policy.posture).toBe("strict");
    expect(policy.pii).toBe("block");
    expect(policy.secrets).toBe("block");
    expect(policy.injection).toBe("block");
    expect(policy.outputLeakProtection).toBe(true);
  });

  it("returns permissive policy when requested", () => {
    const policy = resolvePolicy("permissive");
    expect(policy.posture).toBe("permissive");
    expect(policy.pii).toBe("warn");
    expect(policy.outputLeakProtection).toBe(false);
  });

  it("falls back to standard for unknown posture string", () => {
    expect(resolvePolicy("extreme").posture).toBe("standard");
    expect(resolvePolicy("custom").posture).toBe("standard");
  });

  it("strict has tighter maxInputChars than permissive", () => {
    const strict = resolvePolicy("strict");
    const permissive = resolvePolicy("permissive");
    expect(strict.maxInputChars).toBeLessThan(permissive.maxInputChars);
  });

  it("standard redacts PII rather than blocking", () => {
    const standard = resolvePolicy("standard");
    expect(standard.pii).toBe("redact");
    expect(standard.secrets).toBe("block");
  });
});
