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

  it("handles numbers", () => {
    expect(sanitizeCssVariableName("step 1 color")).toBe("step1color");
  });

  it("handles mixed case with spaces and special chars", () => {
    const result = sanitizeCssVariableName("My Component (Active)");
    expect(result).toBe("mycomponent_active_");
  });
});
