import { describe, expect, it } from "vitest";
import { buildUserDetailUrl, buildReturnUrl } from "./navigation-utils";

describe("buildUserDetailUrl", () => {
  it("returns base URL when no searchParams", () => {
    expect(buildUserDetailUrl("user-123")).toBe("/admin/users/user-123");
  });

  it("returns base URL when searchParams is empty string", () => {
    expect(buildUserDetailUrl("user-abc", "")).toBe("/admin/users/user-abc");
  });

  it("appends encoded searchPageParams when provided", () => {
    const result = buildUserDetailUrl("user-123", "page=2&q=alice");
    expect(result).toBe("/admin/users/user-123?searchPageParams=page%3D2%26q%3Dalice");
  });

  it("encodes special characters in search params", () => {
    const result = buildUserDetailUrl("user-1", "name=Alice Smith");
    expect(result).toContain("searchPageParams=");
    expect(result).toContain("user-1");
  });

  it("preserves the userId in the path", () => {
    const result = buildUserDetailUrl("abc-def-ghi", "x=1");
    expect(result).toContain("/admin/users/abc-def-ghi");
  });
});

describe("buildUserDetailUrl — return type invariants", () => {
  it("always returns a string", () => {
    expect(typeof buildUserDetailUrl("id")).toBe("string");
    expect(typeof buildUserDetailUrl("id", "x=1")).toBe("string");
  });

  it("always starts with /admin/users/", () => {
    expect(buildUserDetailUrl("u1")).toMatch(/^\/admin\/users\//);
    expect(buildUserDetailUrl("u1", "a=b")).toMatch(/^\/admin\/users\//);
  });

  it("result without params has no query string", () => {
    const result = buildUserDetailUrl("u1");
    expect(result.includes("?")).toBe(false);
  });

  it("result with params includes searchPageParams key", () => {
    const result = buildUserDetailUrl("u1", "a=b");
    expect(result.includes("searchPageParams=")).toBe(true);
  });
});

describe("buildReturnUrl", () => {
  it("returns baseUrl when no encodedSearchParams", () => {
    expect(buildReturnUrl("/admin/users")).toBe("/admin/users");
  });

  it("returns baseUrl when encodedSearchParams is empty string", () => {
    expect(buildReturnUrl("/admin/users", "")).toBe("/admin/users");
  });

  it("appends decoded params to baseUrl", () => {
    const encoded = encodeURIComponent("page=2&q=alice");
    const result = buildReturnUrl("/admin/users", encoded);
    expect(result).toBe("/admin/users?page=2&q=alice");
  });

  it("returns baseUrl on invalid URI encoding", () => {
    // Invalid percent-encoding should fall back to baseUrl
    const result = buildReturnUrl("/admin/users", "%ZZ");
    expect(result).toBe("/admin/users");
  });

  it("returns baseUrl when decoded params is empty", () => {
    const empty = encodeURIComponent("");
    const result = buildReturnUrl("/base", empty);
    expect(result).toBe("/base");
  });
});

describe("buildReturnUrl — return type invariants", () => {
  it("always returns a string", () => {
    expect(typeof buildReturnUrl("/x")).toBe("string");
    expect(typeof buildReturnUrl("/x", encodeURIComponent("a=1"))).toBe("string");
    expect(typeof buildReturnUrl("/x", "%ZZ")).toBe("string");
  });

  it("result always contains the baseUrl at the start", () => {
    const base = "/admin/users";
    expect(buildReturnUrl(base)).toMatch(new RegExp(`^${base}`));
    expect(buildReturnUrl(base, encodeURIComponent("a=1"))).toMatch(new RegExp(`^${base}`));
  });

  it("buildUserDetailUrl and buildReturnUrl are inverse when params are present", () => {
    const userId = "user-999";
    const originalParams = "page=3&filter=active";
    const detailUrl = buildUserDetailUrl(userId, originalParams);
    const encoded = new URL("http://x" + detailUrl).searchParams.get("searchPageParams") ?? "";
    const returnUrl = buildReturnUrl("/admin/users", encoded);
    expect(returnUrl).toBe(`/admin/users?${originalParams}`);
  });
});
