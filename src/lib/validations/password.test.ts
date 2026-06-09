import { describe, it, expect } from "vitest";

describe("passwordSchema", () => {
  it("accepts a valid password", async () => {
    const { passwordSchema } = await import("./password");
    const result = passwordSchema.safeParse("Passw0rd!");
    expect(result.success).toBe(true);
  });

  it("rejects passwords shorter than 8 characters", async () => {
    const { passwordSchema } = await import("./password");
    const result = passwordSchema.safeParse("Ab1");
    expect(result.success).toBe(false);
  });

  it("rejects passwords longer than 20 characters", async () => {
    const { passwordSchema } = await import("./password");
    const result = passwordSchema.safeParse("Abcdefghijklmnop12345!");
    expect(result.success).toBe(false);
  });

  it("rejects passwords without a digit", async () => {
    const { passwordSchema } = await import("./password");
    const result = passwordSchema.safeParse("OnlyLetters!");
    expect(result.success).toBe(false);
  });

  it("rejects passwords without a letter", async () => {
    const { passwordSchema } = await import("./password");
    const result = passwordSchema.safeParse("12345678");
    expect(result.success).toBe(false);
  });

  it("accepts exactly 8-character valid password", async () => {
    const { passwordSchema } = await import("./password");
    expect(passwordSchema.safeParse("Valid1!a").success).toBe(true);
  });

  it("accepts exactly 20-character valid password", async () => {
    const { passwordSchema } = await import("./password");
    expect(passwordSchema.safeParse("Abcdefghij1234567890").success).toBe(true);
  });

  it("accepts password with special characters", async () => {
    const { passwordSchema } = await import("./password");
    expect(passwordSchema.safeParse("P@ssw0rd!").success).toBe(true);
  });

  it("rejects empty string", async () => {
    const { passwordSchema } = await import("./password");
    expect(passwordSchema.safeParse("").success).toBe(false);
  });

  it("accepts lowercase-only with digit", async () => {
    const { passwordSchema } = await import("./password");
    expect(passwordSchema.safeParse("password1").success).toBe(true);
  });
});

describe("passwordRequirementsText", () => {
  it("exports a non-empty requirements text string", async () => {
    const { passwordRequirementsText } = await import("./password");
    expect(typeof passwordRequirementsText).toBe("string");
    expect(passwordRequirementsText.length).toBeGreaterThan(0);
  });
});

describe("passwordRegexPattern", () => {
  it("exports a non-empty regex pattern string", async () => {
    const { passwordRegexPattern } = await import("./password");
    expect(typeof passwordRegexPattern).toBe("string");
    expect(passwordRegexPattern.length).toBeGreaterThan(0);
  });
});
