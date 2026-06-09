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
});
