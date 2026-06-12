import { beforeEach, describe, expect, it, vi } from "vitest";

// getSession() delegates to auth.api.getSession; we control that via the
// better-auth mock below, then assert the banned-user backstop layered on top.
const apiGetSessionMock = vi.fn();

vi.mock("better-auth", () => ({
  betterAuth: () => ({ api: { getSession: apiGetSessionMock } }),
}));
vi.mock("better-auth/adapters/drizzle", () => ({ drizzleAdapter: () => ({}) }));
vi.mock("better-auth/next-js", () => ({ nextCookies: () => ({}) }));
vi.mock("better-auth/plugins", () => ({ admin: () => ({}) }));
vi.mock("next/headers", () => ({ headers: vi.fn().mockResolvedValue({}) }));
vi.mock("lib/db/pg/db.pg", () => ({ pgDb: {} }));
vi.mock("lib/db/pg/schema.pg", () => ({
  AccountTable: {},
  SessionTable: {},
  UserTable: {},
  VerificationTable: {},
}));
vi.mock("lib/db/repository", () => ({
  userRepository: { getUserCount: vi.fn().mockResolvedValue(1) },
}));
vi.mock("./config", () => ({
  getAuthConfig: () => ({
    emailAndPasswordEnabled: true,
    signUpEnabled: true,
    socialAuthenticationProviders: {},
  }),
}));
vi.mock("./entra-claims", () => ({
  parseJwtClaims: vi.fn(),
  roleFromEntraClaims: vi.fn(),
}));
vi.mock("./entra-team-mappings", () => ({
  syncEntraTeamMemberships: vi.fn(),
}));
vi.mock("./roles", () => ({ ac: {}, admin: {}, editor: {}, user: {} }));
vi.mock("logger", () => ({
  default: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

const { getSession } = await import("./auth-instance");

describe("getSession — banned-user backstop", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the session for a normal (non-banned) user", async () => {
    const session = { user: { id: "u1", banned: false }, session: {} };
    apiGetSessionMock.mockResolvedValue(session);
    await expect(getSession()).resolves.toEqual(session);
  });

  it("returns the session when banned is null/undefined", async () => {
    const session = { user: { id: "u1" }, session: {} };
    apiGetSessionMock.mockResolvedValue(session);
    await expect(getSession()).resolves.toEqual(session);
  });

  it("returns null for a banned user (backstop)", async () => {
    apiGetSessionMock.mockResolvedValue({
      user: { id: "u1", banned: true },
      session: {},
    });
    await expect(getSession()).resolves.toBeNull();
  });

  it("returns null when there is no session", async () => {
    apiGetSessionMock.mockResolvedValue(null);
    await expect(getSession()).resolves.toBeNull();
  });

  it("returns null and swallows errors from the underlying provider", async () => {
    apiGetSessionMock.mockRejectedValue(new Error("boom"));
    await expect(getSession()).resolves.toBeNull();
  });
});
