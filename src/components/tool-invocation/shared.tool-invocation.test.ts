import { describe, expect, it } from "vitest";
import { sanitizeCssVariableName } from "./shared.tool-invocation";

describe("sanitizeCssVariableName", () => {
  it("lowercases the input", () => {
    expect(sanitizeCssVariableName("HELLO")).toBe("hello");
  });

  it("removes spaces", () => {
    expect(sanitizeCssVariableName("hello world")).toBe("helloworld");
  });

  it("replaces special chars with underscore", () => {
    expect(sanitizeCssVariableName("foo.bar")).toBe("foo_bar");
    expect(sanitizeCssVariableName("foo@bar")).toBe("foo_bar");
  });

  it("preserves hyphens", () => {
    expect(sanitizeCssVariableName("my-label")).toBe("my-label");
  });

  it("preserves underscores", () => {
    expect(sanitizeCssVariableName("my_label")).toBe("my_label");
  });

  it("preserves numbers", () => {
    expect(sanitizeCssVariableName("tool42")).toBe("tool42");
  });

  it("returns empty string for empty input", () => {
    expect(sanitizeCssVariableName("")).toBe("");
  });

  it("handles mixed case with spaces and special chars", () => {
    // "My Tool (Beta)" → strip spaces → "MyTool(Beta)" → lowercase → "mytool(beta)" → replace non-[a-z0-9-_] → "mytool_beta_"
    const result = sanitizeCssVariableName("My Tool (Beta)");
    expect(result).toBe("mytool_beta_");
  });

  it("replaces parentheses with underscores", () => {
    expect(sanitizeCssVariableName("tool(arg)")).toBe("tool_arg_");
  });

  it("consecutive spaces become empty (spaces stripped)", () => {
    const result = sanitizeCssVariableName("a  b");
    expect(result).toBe("ab");
  });
});

describe("sanitizeCssVariableName — return type invariants", () => {
  it("always returns a string", () => {
    for (const input of ["hello", "HELLO", "h-e-l", "1 2 3", ""]) {
      expect(typeof sanitizeCssVariableName(input)).toBe("string");
    }
  });

  it("result contains only [a-z0-9\\-_] characters", () => {
    const inputs = ["Hello World", "foo.bar", "test@123", "my-label_ok", "ABC"];
    for (const input of inputs) {
      const result = sanitizeCssVariableName(input);
      expect(result).toMatch(/^[a-z0-9\-_]*$/);
    }
  });

  it("length is at most the original (no chars added)", () => {
    const input = "Hello World!";
    expect(sanitizeCssVariableName(input).length).toBeLessThanOrEqual(input.length);
  });
});
