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
  it("accepts 'github'", () => {
    expect(() => SocialAuthenticationProviderSchema.parse("github")).not.toThrow();
  });

  it("accepts 'google'", () => {
    expect(() => SocialAuthenticationProviderSchema.parse("google")).not.toThrow();
  });

  it("accepts 'microsoft'", () => {
    expect(() => SocialAuthenticationProviderSchema.parse("microsoft")).not.toThrow();
  });

  it("rejects unknown provider", () => {
    expect(() => SocialAuthenticationProviderSchema.parse("twitter")).toThrow();
  });

  it("rejects empty string", () => {
    expect(() => SocialAuthenticationProviderSchema.parse("")).toThrow();
  });
});

describe("GitHubConfigSchema", () => {
  it("accepts valid github config", () => {
    expect(() =>
      GitHubConfigSchema.parse({ clientId: "gh-id", clientSecret: "gh-secret" }),
    ).not.toThrow();
  });

  it("accepts config with disableSignUp", () => {
    expect(() =>
      GitHubConfigSchema.parse({
        clientId: "gh-id",
        clientSecret: "gh-secret",
        disableSignUp: true,
      }),
    ).not.toThrow();
  });

  it("rejects empty clientId", () => {
    expect(() =>
      GitHubConfigSchema.parse({ clientId: "", clientSecret: "secret" }),
    ).toThrow();
  });

  it("rejects missing clientSecret", () => {
    expect(() => GitHubConfigSchema.parse({ clientId: "id" })).toThrow();
  });
});

describe("GoogleConfigSchema", () => {
  it("accepts valid google config", () => {
    expect(() =>
      GoogleConfigSchema.parse({ clientId: "g-id", clientSecret: "g-secret" }),
    ).not.toThrow();
  });

  it("accepts config with select_account prompt", () => {
    expect(() =>
      GoogleConfigSchema.parse({
        clientId: "g-id",
        clientSecret: "g-secret",
        prompt: "select_account",
      }),
    ).not.toThrow();
  });

  it("rejects invalid prompt value", () => {
    expect(() =>
      GoogleConfigSchema.parse({
        clientId: "g-id",
        clientSecret: "g-secret",
        prompt: "consent",
      }),
    ).toThrow();
  });
});

describe("MicrosoftConfigSchema", () => {
  it("accepts minimal config", () => {
    expect(() =>
      MicrosoftConfigSchema.parse({ clientId: "ms-id", clientSecret: "ms-secret" }),
    ).not.toThrow();
  });

  it("defaults tenantId to 'common'", () => {
    const result = MicrosoftConfigSchema.parse({
      clientId: "ms-id",
      clientSecret: "ms-secret",
    });
    expect(result.tenantId).toBe("common");
  });

  it("accepts custom tenantId", () => {
    const result = MicrosoftConfigSchema.parse({
      clientId: "ms-id",
      clientSecret: "ms-secret",
      tenantId: "my-tenant",
    });
    expect(result.tenantId).toBe("my-tenant");
  });
});

describe("SocialAuthenticationConfigSchema", () => {
  it("accepts empty object (all providers optional)", () => {
    expect(() => SocialAuthenticationConfigSchema.parse({})).not.toThrow();
  });

  it("accepts only github provider", () => {
    expect(() =>
      SocialAuthenticationConfigSchema.parse({
        github: { clientId: "g", clientSecret: "s" },
      }),
    ).not.toThrow();
  });

  it("accepts all providers", () => {
    expect(() =>
      SocialAuthenticationConfigSchema.parse({
        github: { clientId: "g1", clientSecret: "s1" },
        google: { clientId: "g2", clientSecret: "s2" },
        microsoft: { clientId: "g3", clientSecret: "s3" },
      }),
    ).not.toThrow();
  });
});

describe("AuthConfigSchema", () => {
  it("defaults emailAndPasswordEnabled to true", () => {
    const result = AuthConfigSchema.parse({
      socialAuthenticationProviders: {},
    });
    expect(result.emailAndPasswordEnabled).toBe(true);
  });

  it("defaults signUpEnabled to true", () => {
    const result = AuthConfigSchema.parse({
      socialAuthenticationProviders: {},
    });
    expect(result.signUpEnabled).toBe(true);
  });

  it("accepts string 'false' for emailAndPasswordEnabled (envBooleanSchema)", () => {
    const result = AuthConfigSchema.parse({
      emailAndPasswordEnabled: "false",
      signUpEnabled: "true",
      socialAuthenticationProviders: {},
    });
    expect(result.emailAndPasswordEnabled).toBe(false);
    expect(result.signUpEnabled).toBe(true);
  });

  it("accepts boolean true for signUpEnabled", () => {
    const result = AuthConfigSchema.parse({
      signUpEnabled: true,
      socialAuthenticationProviders: {},
    });
    expect(result.signUpEnabled).toBe(true);
  });

  it("rejects missing socialAuthenticationProviders", () => {
    expect(() => AuthConfigSchema.parse({})).toThrow();
  });
});
