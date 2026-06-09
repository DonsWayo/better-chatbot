import { describe, it, expect, vi } from "vitest";

describe("lib/const environment constants", () => {
  it("PROMPT_PASTE_MAX_LENGTH is a positive number", async () => {
    const { PROMPT_PASTE_MAX_LENGTH } = await import("./const");
    expect(PROMPT_PASTE_MAX_LENGTH).toBeGreaterThan(0);
    expect(PROMPT_PASTE_MAX_LENGTH).toBe(1000);
  });

  it("COOKIE_KEY_SIDEBAR_STATE is sidebar:state", async () => {
    const { COOKIE_KEY_SIDEBAR_STATE } = await import("./const");
    expect(COOKIE_KEY_SIDEBAR_STATE).toBe("sidebar:state");
  });

  it("COOKIE_KEY_LOCALE is i18n:locale", async () => {
    const { COOKIE_KEY_LOCALE } = await import("./const");
    expect(COOKIE_KEY_LOCALE).toBe("i18n:locale");
  });

  it("OAUTH_REQUIRED_CODE is OAUTH_REQUIRED", async () => {
    const { OAUTH_REQUIRED_CODE } = await import("./const");
    expect(OAUTH_REQUIRED_CODE).toBe("OAUTH_REQUIRED");
  });

  it("IS_DEV is true in test environment (NODE_ENV=test)", async () => {
    const { IS_DEV } = await import("./const");
    // vitest runs with NODE_ENV=test, which is not 'production'
    expect(IS_DEV).toBe(true);
  });

  it("IS_VERCEL_ENV reflects VERCEL env variable", async () => {
    vi.stubEnv("VERCEL", "1");
    vi.resetModules();
    const { IS_VERCEL_ENV } = await import("./const");
    expect(IS_VERCEL_ENV).toBe(true);
    vi.unstubAllEnvs();
  });

  it("IS_DOCKER_ENV reflects DOCKER_BUILD env variable", async () => {
    vi.stubEnv("DOCKER_BUILD", "1");
    vi.resetModules();
    const { IS_DOCKER_ENV } = await import("./const");
    expect(IS_DOCKER_ENV).toBe(true);
    vi.unstubAllEnvs();
  });
});

describe("SUPPORTED_LOCALES", () => {
  it("is a non-empty array", async () => {
    const { SUPPORTED_LOCALES } = await import("./const");
    expect(Array.isArray(SUPPORTED_LOCALES)).toBe(true);
    expect(SUPPORTED_LOCALES.length).toBeGreaterThan(0);
  });

  it("includes English locale", async () => {
    const { SUPPORTED_LOCALES } = await import("./const");
    expect(SUPPORTED_LOCALES.some((l) => l.code === "en")).toBe(true);
  });

  it("every locale has code and name", async () => {
    const { SUPPORTED_LOCALES } = await import("./const");
    for (const locale of SUPPORTED_LOCALES) {
      expect(locale.code).toBeDefined();
      expect(locale.name).toBeDefined();
      expect(locale.code.length).toBe(2);
    }
  });
});

describe("BASE_THEMES", () => {
  it("is a non-empty array", async () => {
    const { BASE_THEMES } = await import("./const");
    expect(Array.isArray(BASE_THEMES)).toBe(true);
    expect(BASE_THEMES.length).toBeGreaterThan(0);
  });

  it("includes default theme", async () => {
    const { BASE_THEMES } = await import("./const");
    expect(BASE_THEMES).toContain("default");
  });

  it("all themes are strings", async () => {
    const { BASE_THEMES } = await import("./const");
    for (const theme of BASE_THEMES) {
      expect(typeof theme).toBe("string");
    }
  });
});

describe("BASE_URL", () => {
  it("defaults to localhost:3000 format when no env vars set", async () => {
    vi.stubEnv("BETTER_AUTH_URL", "");
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("PORT", "");
    vi.resetModules();
    const { BASE_URL } = await import("./const");
    expect(BASE_URL).toMatch(/http:\/\/localhost/);
    vi.unstubAllEnvs();
  });

  it("uses BETTER_AUTH_URL when set", async () => {
    vi.stubEnv("BETTER_AUTH_URL", "https://myapp.example.com");
    vi.resetModules();
    const { BASE_URL } = await import("./const");
    expect(BASE_URL).toBe("https://myapp.example.com");
    vi.unstubAllEnvs();
  });

  it("strips trailing slashes", async () => {
    vi.stubEnv("BETTER_AUTH_URL", "https://myapp.example.com/");
    vi.resetModules();
    const { BASE_URL } = await import("./const");
    expect(BASE_URL).toBe("https://myapp.example.com");
    vi.unstubAllEnvs();
  });
});
