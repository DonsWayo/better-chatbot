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

  it("standard blocks injection", () => {
    expect(resolvePolicy("standard").injection).toBe("block");
  });

  it("standard has outputLeakProtection enabled", () => {
    expect(resolvePolicy("standard").outputLeakProtection).toBe(true);
  });

  it("permissive warns on injection rather than blocking", () => {
    expect(resolvePolicy("permissive").injection).toBe("warn");
  });

  it("permissive redacts secrets rather than blocking", () => {
    expect(resolvePolicy("permissive").secrets).toBe("redact");
  });

  it("strict has maxInputChars of 20000", () => {
    expect(resolvePolicy("strict").maxInputChars).toBe(20_000);
  });

  it("standard has maxInputChars of 50000", () => {
    expect(resolvePolicy("standard").maxInputChars).toBe(50_000);
  });

  it("permissive has maxInputChars of 100000", () => {
    expect(resolvePolicy("permissive").maxInputChars).toBe(100_000);
  });

  it("posture field matches the requested posture for each valid value", () => {
    expect(resolvePolicy("strict").posture).toBe("strict");
    expect(resolvePolicy("standard").posture).toBe("standard");
    expect(resolvePolicy("permissive").posture).toBe("permissive");
  });

  it("strict has the smallest maxInputChars of all postures", () => {
    const { maxInputChars: strictChars } = resolvePolicy("strict");
    expect(strictChars).toBeLessThan(resolvePolicy("standard").maxInputChars);
    expect(strictChars).toBeLessThan(resolvePolicy("permissive").maxInputChars);
  });
});
