import { describe, it, expect } from "vitest";
import { envBooleanSchema, VisibilitySchema } from "./util";

describe("envBooleanSchema", () => {
  it("returns false for undefined", () => {
    const r = envBooleanSchema.safeParse(undefined);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toBe(false);
  });

  it('transforms "true" to true', () => {
    const r = envBooleanSchema.safeParse("true");
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toBe(true);
  });

  it('transforms "TRUE" to true (case-insensitive)', () => {
    const r = envBooleanSchema.safeParse("TRUE");
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toBe(true);
  });

  it('transforms "1" to true', () => {
    const r = envBooleanSchema.safeParse("1");
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toBe(true);
  });

  it('transforms "y" to true', () => {
    const r = envBooleanSchema.safeParse("y");
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toBe(true);
  });

  it('transforms "Y" to true (case-insensitive)', () => {
    const r = envBooleanSchema.safeParse("Y");
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toBe(true);
  });

  it('transforms "false" to false', () => {
    const r = envBooleanSchema.safeParse("false");
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toBe(false);
  });

  it('transforms "0" to false', () => {
    const r = envBooleanSchema.safeParse("0");
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toBe(false);
  });

  it('transforms "no" to false', () => {
    const r = envBooleanSchema.safeParse("no");
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toBe(false);
  });

  it("passes through boolean true", () => {
    const r = envBooleanSchema.safeParse(true);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toBe(true);
  });

  it("passes through boolean false", () => {
    const r = envBooleanSchema.safeParse(false);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toBe(false);
  });
});

describe("VisibilitySchema", () => {
  it('accepts "public"', () => {
    expect(VisibilitySchema.safeParse("public").success).toBe(true);
  });

  it('accepts "private"', () => {
    expect(VisibilitySchema.safeParse("private").success).toBe(true);
  });

  it('accepts "readonly"', () => {
    expect(VisibilitySchema.safeParse("readonly").success).toBe(true);
  });

  it("rejects unknown value", () => {
    expect(VisibilitySchema.safeParse("hidden").success).toBe(false);
  });

  it("rejects empty string", () => {
    expect(VisibilitySchema.safeParse("").success).toBe(false);
  });

  it("has exactly 3 options", () => {
    expect(VisibilitySchema.options).toHaveLength(3);
  });

  it("rejects uppercase PUBLIC", () => {
    expect(VisibilitySchema.safeParse("PUBLIC").success).toBe(false);
  });

  it("rejects undefined", () => {
    expect(VisibilitySchema.safeParse(undefined).success).toBe(false);
  });
});

describe("envBooleanSchema — falsy string values", () => {
  it('"no" → false', () => {
    const r = envBooleanSchema.safeParse("no");
    expect(r.success && r.data).toBe(false);
  });

  it('"off" → false (not in truthy list)', () => {
    const r = envBooleanSchema.safeParse("off");
    expect(r.success && r.data).toBe(false);
  });

  it('"yes" → false (not in truthy list)', () => {
    const r = envBooleanSchema.safeParse("yes");
    expect(r.success && r.data).toBe(false);
  });

  it('"2" → false (only "1" is truthy)', () => {
    const r = envBooleanSchema.safeParse("2");
    expect(r.success && r.data).toBe(false);
  });

  it("empty string → false", () => {
    const r = envBooleanSchema.safeParse("");
    expect(r.success && r.data).toBe(false);
  });
});
