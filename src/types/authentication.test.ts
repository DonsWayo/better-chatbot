import { describe, it, expect } from "vitest";
import {
  SocialAuthenticationProviderSchema,
  GitHubConfigSchema,
  GoogleConfigSchema,
  MicrosoftConfigSchema,
  SocialAuthenticationConfigSchema,
  AuthConfigSchema,
} from "./authentication";

describe("SocialAuthenticationProviderSchema", () => {
  it("accepts github", () => {
    expect(SocialAuthenticationProviderSchema.safeParse("github").success).toBe(true);
  });

  it("accepts google", () => {
    expect(SocialAuthenticationProviderSchema.safeParse("google").success).toBe(true);
  });

  it("accepts microsoft", () => {
    expect(SocialAuthenticationProviderSchema.safeParse("microsoft").success).toBe(true);
  });

  it("rejects unknown provider", () => {
    expect(SocialAuthenticationProviderSchema.safeParse("twitter").success).toBe(false);
  });
});

describe("GitHubConfigSchema", () => {
  it("accepts valid config", () => {
    const r = GitHubConfigSchema.safeParse({ clientId: "abc", clientSecret: "xyz" });
    expect(r.success).toBe(true);
  });

  it("rejects empty clientId", () => {
    const r = GitHubConfigSchema.safeParse({ clientId: "", clientSecret: "xyz" });
    expect(r.success).toBe(false);
  });

  it("rejects missing clientSecret", () => {
    const r = GitHubConfigSchema.safeParse({ clientId: "abc" });
    expect(r.success).toBe(false);
  });

  it("allows optional disableSignUp", () => {
    const r = GitHubConfigSchema.safeParse({ clientId: "abc", clientSecret: "xyz", disableSignUp: true });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.disableSignUp).toBe(true);
  });
});

describe("GoogleConfigSchema", () => {
  it("accepts valid config", () => {
    const r = GoogleConfigSchema.safeParse({ clientId: "abc", clientSecret: "xyz" });
    expect(r.success).toBe(true);
  });

  it("accepts prompt: select_account", () => {
    const r = GoogleConfigSchema.safeParse({
      clientId: "abc", clientSecret: "xyz", prompt: "select_account",
    });
    expect(r.success).toBe(true);
  });

  it("rejects other prompt values", () => {
    const r = GoogleConfigSchema.safeParse({
      clientId: "abc", clientSecret: "xyz", prompt: "consent",
    });
    expect(r.success).toBe(false);
  });
});

describe("MicrosoftConfigSchema", () => {
  it("accepts valid config", () => {
    const r = MicrosoftConfigSchema.safeParse({ clientId: "abc", clientSecret: "xyz" });
    expect(r.success).toBe(true);
  });

  it("defaults tenantId to common", () => {
    const r = MicrosoftConfigSchema.safeParse({ clientId: "abc", clientSecret: "xyz" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.tenantId).toBe("common");
  });

  it("accepts custom tenantId", () => {
    const r = MicrosoftConfigSchema.safeParse({
      clientId: "abc", clientSecret: "xyz", tenantId: "myorg.onmicrosoft.com",
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.tenantId).toBe("myorg.onmicrosoft.com");
  });
});

describe("SocialAuthenticationConfigSchema", () => {
  it("accepts empty config (all optional)", () => {
    const r = SocialAuthenticationConfigSchema.safeParse({});
    expect(r.success).toBe(true);
  });

  it("accepts partial config with only github", () => {
    const r = SocialAuthenticationConfigSchema.safeParse({
      github: { clientId: "id", clientSecret: "secret" },
    });
    expect(r.success).toBe(true);
  });
});

describe("AuthConfigSchema", () => {
  it("defaults emailAndPasswordEnabled to true", () => {
    const r = AuthConfigSchema.safeParse({ socialAuthenticationProviders: {} });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.emailAndPasswordEnabled).toBe(true);
  });

  it("defaults signUpEnabled to true", () => {
    const r = AuthConfigSchema.safeParse({ socialAuthenticationProviders: {} });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.signUpEnabled).toBe(true);
  });
});
