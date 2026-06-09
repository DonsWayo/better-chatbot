import { describe, expect, it } from "vitest";
import { storageKeyFromUrl } from "./storage-utils";

describe("storageKeyFromUrl", () => {
  it("extracts key from absolute URL", () => {
    expect(storageKeyFromUrl("https://example.com/uploads/sample.csv")).toBe(
      "uploads/sample.csv",
    );
  });

  it("decodes encoded path segments", () => {
    expect(
      storageKeyFromUrl(
        "https://example.com/uploads/My%20File%20(1).csv?token=123",
      ),
    ).toBe("uploads/My File (1).csv");
  });

  it("returns null for invalid URLs", () => {
    expect(storageKeyFromUrl("not-a-url")).toBeNull();
  });
});

describe("storageKeyFromUrl — return type invariants", () => {
  it("returns a string for valid URLs", () => {
    const result = storageKeyFromUrl("https://cdn.example.com/path/to/file.png");
    expect(typeof result).toBe("string");
  });

  it("returns null for empty string", () => {
    expect(storageKeyFromUrl("")).toBeNull();
  });

  it("returns null for just a domain with no path", () => {
    const result = storageKeyFromUrl("https://example.com");
    expect(result === null || result === "").toBeTruthy();
  });

  it("strips the leading slash from pathname", () => {
    const result = storageKeyFromUrl("https://example.com/my/key.txt");
    expect(result).not.toMatch(/^\//);
  });
});

describe("storageKeyFromUrl — edge case invariants", () => {
  it("handles URLs with query strings", () => {
    const result = storageKeyFromUrl("https://example.com/uploads/file.txt?token=abc&v=1");
    expect(result).toBe("uploads/file.txt");
  });

  it("handles URLs with fragments", () => {
    const result = storageKeyFromUrl("https://example.com/uploads/file.txt#section");
    expect(result).toBe("uploads/file.txt");
  });

  it("decodes percent-encoded spaces", () => {
    const result = storageKeyFromUrl("https://example.com/uploads/my%20file.csv");
    expect(result).toBe("uploads/my file.csv");
  });

  it("decodes percent-encoded parens", () => {
    const result = storageKeyFromUrl("https://example.com/uploads/file%281%29.txt");
    expect(result).toBe("uploads/file(1).txt");
  });

  it("returns null for relative paths", () => {
    expect(storageKeyFromUrl("/relative/path")).toBeNull();
  });
});
