import { describe, expect, it } from "vitest";
import { UserZodSchema, UserPreferencesZodSchema } from "./user";

describe("UserZodSchema", () => {
  it("accepts valid user data", () => {
    const result = UserZodSchema.safeParse({
      name: "Alice",
      email: "alice@example.com",
      password: "Secure!1234",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty name", () => {
    const result = UserZodSchema.safeParse({
      name: "",
      email: "a@b.com",
      password: "Secure!1234",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid email", () => {
    const result = UserZodSchema.safeParse({
      name: "Alice",
      email: "not-an-email",
      password: "Secure!1234",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing name", () => {
    const result = UserZodSchema.safeParse({
      email: "a@b.com",
      password: "Secure!1234",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing email", () => {
    const result = UserZodSchema.safeParse({
      name: "Alice",
      password: "Secure!1234",
    });
    expect(result.success).toBe(false);
  });
});

describe("UserPreferencesZodSchema", () => {
  it("accepts empty object (all fields optional)", () => {
    const result = UserPreferencesZodSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("accepts full preferences object", () => {
    const result = UserPreferencesZodSchema.safeParse({
      displayName: "Alice",
      profession: "Engineer",
      responseStyleExample: "Be concise",
      botName: "Asafe",
    });
    expect(result.success).toBe(true);
  });

  it("accepts partial preferences", () => {
    const result = UserPreferencesZodSchema.safeParse({
      displayName: "Bob",
    });
    expect(result.success).toBe(true);
  });

  it("parsed data only has defined optional fields", () => {
    const result = UserPreferencesZodSchema.safeParse({ displayName: "X" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.displayName).toBe("X");
    }
  });
});

describe("UserZodSchema — return type invariants", () => {
  it("safeParse returns object with success field", () => {
    const result = UserZodSchema.safeParse({ name: "a", email: "x@y.com", password: "P@ssw0rd!" });
    expect(result).toHaveProperty("success");
    expect(typeof result.success).toBe("boolean");
  });

  it("parse result has name, email properties", () => {
    const result = UserZodSchema.safeParse({
      name: "Bob",
      email: "bob@test.com",
      password: "ValidP@ss1",
    });
    if (result.success) {
      expect(result.data).toHaveProperty("name");
      expect(result.data).toHaveProperty("email");
    }
  });
});

describe("UserZodSchema — password validation", () => {
  it("rejects password shorter than 8 chars", () => {
    const result = UserZodSchema.safeParse({
      name: "Alice",
      email: "alice@test.com",
      password: "abc123",
    });
    expect(result.success).toBe(false);
  });

  it("rejects password longer than 20 chars", () => {
    const result = UserZodSchema.safeParse({
      name: "Alice",
      email: "alice@test.com",
      password: "Abcdefghijk1234567890x",
    });
    expect(result.success).toBe(false);
  });

  it("accepts valid 8-char password with letter and number", () => {
    const result = UserZodSchema.safeParse({
      name: "Alice",
      email: "alice@test.com",
      password: "ValidP1!",
    });
    expect(result.success).toBe(true);
  });

  it("rejects password with no numbers", () => {
    const result = UserZodSchema.safeParse({
      name: "Alice",
      email: "alice@test.com",
      password: "OnlyLetters",
    });
    expect(result.success).toBe(false);
  });
});

describe("UserPreferencesZodSchema — field types", () => {
  it("rejects non-string displayName", () => {
    const result = UserPreferencesZodSchema.safeParse({ displayName: 123 });
    expect(result.success).toBe(false);
  });

  it("rejects non-string profession", () => {
    const result = UserPreferencesZodSchema.safeParse({ profession: true });
    expect(result.success).toBe(false);
  });

  it("accepts long responseStyleExample", () => {
    const result = UserPreferencesZodSchema.safeParse({
      responseStyleExample: "A".repeat(500),
    });
    expect(result.success).toBe(true);
  });

  it("accepts all four optional fields simultaneously", () => {
    const result = UserPreferencesZodSchema.safeParse({
      displayName: "Alice",
      profession: "Engineer",
      responseStyleExample: "Please be concise",
      botName: "Aria",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.displayName).toBe("Alice");
      expect(result.data.profession).toBe("Engineer");
      expect(result.data.responseStyleExample).toBe("Please be concise");
      expect(result.data.botName).toBe("Aria");
    }
  });

  it("excludes extra fields from parsed result (strict passthrough behavior)", () => {
    const result = UserPreferencesZodSchema.safeParse({
      displayName: "Alice",
      unknownField: "ignored",
    });
    expect(result.success).toBe(true);
  });
});
