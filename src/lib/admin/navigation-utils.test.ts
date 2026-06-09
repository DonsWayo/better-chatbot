import { describe, it, expect } from "vitest";
import { buildUserDetailUrl, buildReturnUrl } from "./navigation-utils";

describe("buildUserDetailUrl", () => {
  it("returns basic URL when no search params", () => {
    expect(buildUserDetailUrl("u-123")).toBe("/admin/users/u-123");
  });

  it("returns basic URL when empty search params string", () => {
    expect(buildUserDetailUrl("u-abc", "")).toBe("/admin/users/u-abc");
  });

  it("URL-encodes search params and appends as query param", () => {
    const url = buildUserDetailUrl("u-1", "page=2&q=hello");
    expect(url).toBe(`/admin/users/u-1?searchPageParams=${encodeURIComponent("page=2&q=hello")}`);
  });

  it("handles special characters in userId", () => {
    const url = buildUserDetailUrl("user@example.com");
    expect(url).toBe("/admin/users/user@example.com");
  });
});

describe("buildReturnUrl", () => {
  it("returns base URL when no encoded params", () => {
    expect(buildReturnUrl("/admin/users")).toBe("/admin/users");
  });

  it("returns base URL when empty encoded params", () => {
    expect(buildReturnUrl("/admin/users", "")).toBe("/admin/users");
  });

  it("decodes params and appends to base URL", () => {
    const encoded = encodeURIComponent("page=3&sort=name");
    const url = buildReturnUrl("/admin/users", encoded);
    expect(url).toBe("/admin/users?page=3&sort=name");
  });

  it("returns base URL when decoded params are empty string", () => {
    const encoded = encodeURIComponent("");
    const url = buildReturnUrl("/admin/users", encoded);
    expect(url).toBe("/admin/users");
  });

  it("returns base URL for malformed encoded string", () => {
    // Deliberately invalid percent encoding
    const url = buildReturnUrl("/admin/users", "%ZZinvalid");
    expect(url).toBe("/admin/users");
  });

  it("preserves multiple query params through encode/decode roundtrip", () => {
    const params = "page=5&q=test+user&sort=asc";
    const encoded = encodeURIComponent(params);
    const url = buildReturnUrl("/admin/users", encoded);
    expect(url).toBe(`/admin/users?${params}`);
  });

  it("works with non-admin base URLs", () => {
    const encoded = encodeURIComponent("filter=active");
    expect(buildReturnUrl("/some/other/path", encoded)).toBe("/some/other/path?filter=active");
  });
});

describe("buildUserDetailUrl — roundtrip with buildReturnUrl", () => {
  it("params survive encode/decode roundtrip via both functions", () => {
    const originalParams = "page=2&q=john&sort=desc";
    const detailUrl = buildUserDetailUrl("u-99", originalParams);
    const encoded = new URL(detailUrl, "http://localhost").searchParams.get("searchPageParams")!;
    const returnUrl = buildReturnUrl("/admin/users", encoded);
    expect(returnUrl).toBe(`/admin/users?${originalParams}`);
  });
});
