import { describe, expect, it } from "vitest";
import { envBooleanSchema, VisibilitySchema } from "./util";

describe("envBooleanSchema", () => {
  it("transforms 'true' to true", () => {
    expect(envBooleanSchema.parse("true")).toBe(true);
  });

  it("transforms 'TRUE' (case-insensitive) to true", () => {
    expect(envBooleanSchema.parse("TRUE")).toBe(true);
  });

  it("transforms '1' to true", () => {
    expect(envBooleanSchema.parse("1")).toBe(true);
  });

  it("transforms 'y' to true", () => {
    expect(envBooleanSchema.parse("y")).toBe(true);
  });

  it("transforms 'Y' (case-insensitive) to true", () => {
    expect(envBooleanSchema.parse("Y")).toBe(true);
  });

  it("transforms boolean true to true", () => {
    expect(envBooleanSchema.parse(true)).toBe(true);
  });

  it("transforms 'false' to false", () => {
    expect(envBooleanSchema.parse("false")).toBe(false);
  });

  it("transforms '0' to false", () => {
    expect(envBooleanSchema.parse("0")).toBe(false);
  });

  it("transforms boolean false to false", () => {
    expect(envBooleanSchema.parse(false)).toBe(false);
  });

  it("transforms undefined to false", () => {
    expect(envBooleanSchema.parse(undefined)).toBe(false);
  });

  it("transforms empty string to false", () => {
    expect(envBooleanSchema.parse("")).toBe(false);
  });

  it("transforms arbitrary string to false", () => {
    expect(envBooleanSchema.parse("yes")).toBe(false);
    expect(envBooleanSchema.parse("on")).toBe(false);
  });
});

describe("envBooleanSchema — return type invariants", () => {
  it("always returns a boolean", () => {
    for (const input of ["true", "false", "1", "0", "y", "", undefined, true, false]) {
      expect(typeof envBooleanSchema.parse(input)).toBe("boolean");
    }
  });

  it("safeParse always succeeds (schema is optional)", () => {
    expect(envBooleanSchema.safeParse(undefined).success).toBe(true);
    expect(envBooleanSchema.safeParse("true").success).toBe(true);
    expect(envBooleanSchema.safeParse("anything").success).toBe(true);
  });
});

describe("VisibilitySchema", () => {
  it("accepts 'public'", () => {
    expect(VisibilitySchema.safeParse("public").success).toBe(true);
  });

  it("accepts 'private'", () => {
    expect(VisibilitySchema.safeParse("private").success).toBe(true);
  });

  it("accepts 'readonly'", () => {
    expect(VisibilitySchema.safeParse("readonly").success).toBe(true);
  });

  it("rejects 'shared'", () => {
    expect(VisibilitySchema.safeParse("shared").success).toBe(false);
  });

  it("rejects empty string", () => {
    expect(VisibilitySchema.safeParse("").success).toBe(false);
  });

  it("rejects undefined", () => {
    expect(VisibilitySchema.safeParse(undefined).success).toBe(false);
  });

  it("rejects 'Public' (case-sensitive)", () => {
    expect(VisibilitySchema.safeParse("Public").success).toBe(false);
  });

  it("rejects numeric value", () => {
    expect(VisibilitySchema.safeParse(1).success).toBe(false);
  });
});

describe("VisibilitySchema — return type invariants", () => {
  it("parse returns the exact string passed", () => {
    expect(VisibilitySchema.parse("public")).toBe("public");
    expect(VisibilitySchema.parse("private")).toBe("private");
    expect(VisibilitySchema.parse("readonly")).toBe("readonly");
  });

  it("enum options are exactly 3", () => {
    const opts = VisibilitySchema.options;
    expect(opts.length).toBe(3);
  });

  it("enum contains public, private, readonly", () => {
    const opts = VisibilitySchema.options;
    expect(opts).toContain("public");
    expect(opts).toContain("private");
    expect(opts).toContain("readonly");
  });
});
