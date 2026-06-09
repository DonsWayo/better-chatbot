import { describe, it, expect } from "vitest";
import { UserZodSchema, UserPreferencesZodSchema } from "./user";

describe("UserZodSchema", () => {
  const valid = {
    name: "Alice Smith",
    email: "alice@example.com",
    password: "Password1",
  };

  it("accepts valid user", () => {
    const r = UserZodSchema.safeParse(valid);
    expect(r.success).toBe(true);
  });

  it("rejects empty name", () => {
    const r = UserZodSchema.safeParse({ ...valid, name: "" });
    expect(r.success).toBe(false);
  });

  it("rejects invalid email", () => {
    const r = UserZodSchema.safeParse({ ...valid, email: "not-an-email" });
    expect(r.success).toBe(false);
  });

  it("rejects missing email", () => {
    const { email: _, ...rest } = valid;
    const r = UserZodSchema.safeParse(rest);
    expect(r.success).toBe(false);
  });

  it("rejects password shorter than 8 characters", () => {
    const r = UserZodSchema.safeParse({ ...valid, password: "Abc1" });
    expect(r.success).toBe(false);
  });

  it("rejects password longer than 20 characters", () => {
    const r = UserZodSchema.safeParse({
      ...valid,
      password: "Abcdefgh12345678901234",
    });
    expect(r.success).toBe(false);
  });

  it("rejects password without a digit", () => {
    const r = UserZodSchema.safeParse({ ...valid, password: "Abcdefghij" });
    expect(r.success).toBe(false);
  });

  it("rejects password without a letter", () => {
    const r = UserZodSchema.safeParse({ ...valid, password: "12345678" });
    expect(r.success).toBe(false);
  });

  it("accepts password with exactly 8 characters", () => {
    const r = UserZodSchema.safeParse({ ...valid, password: "Abcdef1g" });
    expect(r.success).toBe(true);
  });
});

describe("UserPreferencesZodSchema", () => {
  it("accepts empty object (all optional)", () => {
    const r = UserPreferencesZodSchema.safeParse({});
    expect(r.success).toBe(true);
  });

  it("accepts displayName", () => {
    const r = UserPreferencesZodSchema.safeParse({ displayName: "Dr. Smith" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.displayName).toBe("Dr. Smith");
  });

  it("accepts profession", () => {
    const r = UserPreferencesZodSchema.safeParse({
      profession: "Software Engineer",
    });
    expect(r.success).toBe(true);
  });

  it("accepts responseStyleExample", () => {
    const r = UserPreferencesZodSchema.safeParse({
      responseStyleExample: "Short and concise.",
    });
    expect(r.success).toBe(true);
  });

  it("accepts botName", () => {
    const r = UserPreferencesZodSchema.safeParse({ botName: "Asafe" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.botName).toBe("Asafe");
  });

  it("accepts all fields together", () => {
    const r = UserPreferencesZodSchema.safeParse({
      displayName: "Alice",
      profession: "Engineer",
      responseStyleExample: "Be brief.",
      botName: "Bot",
    });
    expect(r.success).toBe(true);
  });
});
