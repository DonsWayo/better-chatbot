import { describe, it, expect } from "vitest";
import { sanitizeCssVariableName } from "./shared.tool-invocation";

describe("sanitizeCssVariableName", () => {
  it("removes spaces", () => {
    expect(sanitizeCssVariableName("my label")).toBe("mylabel");
  });

  it("lowercases the result", () => {
    expect(sanitizeCssVariableName("MyLabel")).toBe("mylabel");
  });

  it("replaces special characters with underscore", () => {
    expect(sanitizeCssVariableName("foo!bar@baz")).toBe("foo_bar_baz");
  });

  it("keeps hyphens", () => {
    expect(sanitizeCssVariableName("foo-bar")).toBe("foo-bar");
  });

  it("keeps underscores", () => {
    expect(sanitizeCssVariableName("foo_bar")).toBe("foo_bar");
  });

  it("handles empty string", () => {
    expect(sanitizeCssVariableName("")).toBe("");
  });

  it("handles already valid CSS variable name", () => {
    expect(sanitizeCssVariableName("color-primary")).toBe("color-primary");
  });

  it("handles numbers in string", () => {
    expect(sanitizeCssVariableName("step 1 color")).toBe("step1color");
  });

  it("handles mixed case with spaces and special chars", () => {
    const result = sanitizeCssVariableName("My Component (Active)");
    expect(result).toBe("mycomponent_active_");
  });

  it("handles string with only special chars", () => {
    const result = sanitizeCssVariableName("!@#$");
    expect(result).toBe("____");
  });

  it("handles string with only spaces", () => {
    const result = sanitizeCssVariableName("    ");
    expect(result).toBe("");
  });

  it("handles numbers only", () => {
    expect(sanitizeCssVariableName("12345")).toBe("12345");
  });

  it("handles consecutive special chars become consecutive underscores", () => {
    expect(sanitizeCssVariableName("a!!b")).toBe("a__b");
  });

  it("does not strip leading or trailing hyphens", () => {
    expect(sanitizeCssVariableName("-var-")).toBe("-var-");
  });

  it("dot becomes underscore", () => {
    expect(sanitizeCssVariableName("v1.2.3")).toBe("v1_2_3");
  });

  it("slash becomes underscore", () => {
    expect(sanitizeCssVariableName("a/b")).toBe("a_b");
  });

  it("handles mixed hyphen underscore and letters", () => {
    expect(sanitizeCssVariableName("bg_color-main")).toBe("bg_color-main");
  });

  it("uppercase letters with numbers are normalized", () => {
    expect(sanitizeCssVariableName("Color123")).toBe("color123");
  });

  it("tab character becomes underscore (not removed like space)", () => {
    expect(sanitizeCssVariableName("a\tb")).toBe("a_b");
  });

  it("colon becomes underscore", () => {
    expect(sanitizeCssVariableName("key:value")).toBe("key_value");
  });

  it("spaces are removed, not replaced with underscore", () => {
    expect(sanitizeCssVariableName("a b")).toBe("ab");
    expect(sanitizeCssVariableName("a b")).not.toBe("a_b");
  });

  it("parentheses become underscores", () => {
    expect(sanitizeCssVariableName("(foo)")).toBe("_foo_");
  });

  it("plus sign becomes underscore", () => {
    expect(sanitizeCssVariableName("a+b")).toBe("a_b");
  });

  it("result is deterministic (same input → same output)", () => {
    const input = "My Component [Active] v2.0";
    expect(sanitizeCssVariableName(input)).toBe(sanitizeCssVariableName(input));
  });
});
