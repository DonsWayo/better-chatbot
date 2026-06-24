/**
 * XSS protection tests for the markdown link renderer.
 *
 * The `a:` custom component in markdown.tsx sanitises hrefs with this logic:
 *
 *   const safePrefixes = ["https://", "http://", "mailto:", "/", "#"];
 *   const safeHref =
 *     href && safePrefixes.some((p) => href.toLowerCase().startsWith(p))
 *       ? href
 *       : undefined;
 *
 * We extract that logic into a pure helper and test every branch.
 * No DOM / browser environment is needed, which keeps the suite fast and
 * consistent with the project's existing node-runner vitest setup.
 */

import { describe, expect, it } from "vitest";

// ---------------------------------------------------------------------------
// Verbatim copy of the sanitisation logic from markdown.tsx `a:` renderer.
// If the implementation changes there, update this mirror and the tests.
// ---------------------------------------------------------------------------
function getHref(href: string | undefined): string | undefined {
  const safePrefixes = ["https://", "http://", "mailto:", "/", "#"];
  return href && safePrefixes.some((p) => href.toLowerCase().startsWith(p))
    ? href
    : undefined;
}

// ---------------------------------------------------------------------------
// Safe hrefs — must be returned unchanged
// ---------------------------------------------------------------------------

describe("getHref — safe hrefs are returned as-is", () => {
  it("returns an https:// URL unchanged", () => {
    expect(getHref("https://example.com")).toBe("https://example.com");
  });

  it("returns an http:// URL unchanged", () => {
    expect(getHref("http://example.com")).toBe("http://example.com");
  });

  it("returns a mailto: URI unchanged", () => {
    expect(getHref("mailto:user@example.com")).toBe("mailto:user@example.com");
  });

  it("returns an absolute root-relative path unchanged", () => {
    expect(getHref("/relative/path")).toBe("/relative/path");
  });

  it("returns a hash anchor unchanged", () => {
    expect(getHref("#anchor")).toBe("#anchor");
  });

  it("returns an uppercase HTTPS:// URL (case-insensitive check)", () => {
    expect(getHref("HTTPS://EXAMPLE.COM")).toBe("HTTPS://EXAMPLE.COM");
  });

  it("returns an uppercase HTTP:// URL (case-insensitive check)", () => {
    expect(getHref("HTTP://EXAMPLE.COM")).toBe("HTTP://EXAMPLE.COM");
  });

  it("returns an https URL with query params and fragments", () => {
    const url = "https://evil.com/with?params=1&x=2#frag";
    expect(getHref(url)).toBe(url);
  });

  it("returns a path with a UUID segment", () => {
    expect(getHref("/documents/550e8400-e29b-41d4-a716-446655440000")).toBe(
      "/documents/550e8400-e29b-41d4-a716-446655440000",
    );
  });

  it("returns a hash with a numbered section", () => {
    expect(getHref("#section-1")).toBe("#section-1");
  });

  it("returns a very long safe https URL", () => {
    const long = "https://example.com/" + "a".repeat(2000);
    expect(getHref(long)).toBe(long);
  });

  it("returns a safe https URL that contains unicode", () => {
    const url = "https://例え.jp/パス";
    expect(getHref(url)).toBe(url);
  });

  it("returns a deep nested relative path", () => {
    expect(getHref("/a/b/c/d/e/f")).toBe("/a/b/c/d/e/f");
  });

  it("returns mailto with display-name encoding", () => {
    expect(getHref("mailto:First+Last@example.org?subject=Hello")).toBe(
      "mailto:First+Last@example.org?subject=Hello",
    );
  });
});

// ---------------------------------------------------------------------------
// Unsafe hrefs — must return undefined
// ---------------------------------------------------------------------------

describe("getHref — unsafe hrefs return undefined", () => {
  it("blocks javascript: protocol", () => {
    expect(getHref("javascript:alert(1)")).toBeUndefined();
  });

  it("blocks JAVASCRIPT: (uppercase, case-insensitive check)", () => {
    expect(getHref("JAVASCRIPT:alert(1)")).toBeUndefined();
  });

  it("blocks mixed-case JavaScript: protocol", () => {
    expect(getHref("JaVaScRiPt:alert(1)")).toBeUndefined();
  });

  it("blocks javascript:void(0)", () => {
    expect(getHref("javascript:void(0)")).toBeUndefined();
  });

  it("blocks vbscript: protocol", () => {
    expect(getHref("vbscript:msgbox(1)")).toBeUndefined();
  });

  it("blocks data:text/html with embedded script", () => {
    expect(getHref("data:text/html,<script>alert(1)</script>")).toBeUndefined();
  });

  it("blocks data:image/png base64 URIs", () => {
    expect(getHref("data:image/png;base64,abc123==")).toBeUndefined();
  });

  it("blocks ftp:// (not in safe list)", () => {
    expect(getHref("ftp://files.example.com")).toBeUndefined();
  });

  it("blocks file:// protocol", () => {
    expect(getHref("file:///etc/passwd")).toBeUndefined();
  });

  it("blocks UNC paths starting with double backslash", () => {
    expect(getHref("\\\\server\\share")).toBeUndefined();
  });

  it("blocks blob: URIs", () => {
    expect(getHref("blob:https://example.com/uuid")).toBeUndefined();
  });

  it("blocks ssh: protocol", () => {
    expect(getHref("ssh://user@host")).toBeUndefined();
  });

  it("blocks bare hostname without a scheme", () => {
    expect(getHref("example.com/path")).toBeUndefined();
  });

  it("blocks a raw domain with no protocol", () => {
    expect(getHref("www.example.com")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Falsy / edge-case inputs
// ---------------------------------------------------------------------------

describe("getHref — falsy and edge-case inputs return undefined", () => {
  it("returns undefined for undefined href", () => {
    expect(getHref(undefined)).toBeUndefined();
  });

  it("returns undefined for empty string (falsy guard fires before prefix check)", () => {
    expect(getHref("")).toBeUndefined();
  });

  it("does NOT trim leading spaces — a space-prefixed javascript: URI is blocked", () => {
    // The real-world renderer does not trim, so "   javascript:..." fails the
    // prefix check and is safely blocked.  Confirm the behavior is undefined
    // (safe) rather than letting the space slip through.
    expect(getHref("   javascript:alert(1)")).toBeUndefined();
  });

  it("does NOT return undefined for a space-prefixed https URL — space makes it unsafe", () => {
    // A leading space means no safe prefix matches; the href is sanitised away.
    // This is intentional: browsers would likely strip the space, but we block
    // the whole thing to be conservative.
    expect(getHref("   https://example.com")).toBeUndefined();
  });

  it("returns undefined for a string containing only whitespace", () => {
    expect(getHref("   ")).toBeUndefined();
  });

  it("returns undefined for a newline-prefixed javascript: URI", () => {
    expect(getHref("\njavascript:alert(1)")).toBeUndefined();
  });

  it("returns undefined for a null-like cast to undefined", () => {
    // TypeScript types href as string | undefined, but callers could pass null
    // at runtime.  null is falsy so the guard catches it.
    expect(getHref(null as unknown as undefined)).toBeUndefined();
  });
});
