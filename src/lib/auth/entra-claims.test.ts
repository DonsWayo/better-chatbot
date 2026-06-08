import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { roleFromEntraClaims, parseJwtClaims } from "./entra-claims";

describe("roleFromEntraClaims", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns 'admin' when a group is in the admin list", () => {
    vi.stubEnv("ASAFE_ENTRA_ADMIN_GROUP_IDS", "admin-group-1,admin-group-2");
    vi.stubEnv("ASAFE_ENTRA_EDITOR_GROUP_IDS", "editor-group-1");

    expect(roleFromEntraClaims(["admin-group-1"])).toBe("admin");
  });

  it("returns 'editor' when a group is in the editor list only", () => {
    vi.stubEnv("ASAFE_ENTRA_ADMIN_GROUP_IDS", "admin-group-1");
    vi.stubEnv("ASAFE_ENTRA_EDITOR_GROUP_IDS", "editor-group-1,editor-group-2");

    expect(roleFromEntraClaims(["editor-group-2"])).toBe("editor");
  });

  it("returns 'admin' when group appears in both admin and editor lists (admin takes precedence)", () => {
    const sharedGroup = "shared-group-id";
    vi.stubEnv("ASAFE_ENTRA_ADMIN_GROUP_IDS", sharedGroup);
    vi.stubEnv("ASAFE_ENTRA_EDITOR_GROUP_IDS", sharedGroup);

    expect(roleFromEntraClaims([sharedGroup])).toBe("admin");
  });

  it("returns 'user' when no groups match and no default role is set", () => {
    vi.stubEnv("ASAFE_ENTRA_ADMIN_GROUP_IDS", "admin-group-1");
    vi.stubEnv("ASAFE_ENTRA_EDITOR_GROUP_IDS", "editor-group-1");

    expect(roleFromEntraClaims(["some-other-group"])).toBe("user");
  });

  it("returns the value of ASAFE_DEFAULT_SSO_ROLE='editor' when no groups match", () => {
    vi.stubEnv("ASAFE_ENTRA_ADMIN_GROUP_IDS", "admin-group-1");
    vi.stubEnv("ASAFE_ENTRA_EDITOR_GROUP_IDS", "editor-group-1");
    vi.stubEnv("ASAFE_DEFAULT_SSO_ROLE", "editor");

    expect(roleFromEntraClaims(["unrelated-group"])).toBe("editor");
  });

  it("returns the value of ASAFE_DEFAULT_SSO_ROLE='admin' when no groups match", () => {
    vi.stubEnv("ASAFE_DEFAULT_SSO_ROLE", "admin");

    expect(roleFromEntraClaims(["unrelated-group"])).toBe("admin");
  });

  it("returns 'user' with empty groupIds and no default role", () => {
    vi.stubEnv("ASAFE_ENTRA_ADMIN_GROUP_IDS", "admin-group-1");
    vi.stubEnv("ASAFE_ENTRA_EDITOR_GROUP_IDS", "editor-group-1");

    expect(roleFromEntraClaims([])).toBe("user");
  });

  it("returns ASAFE_DEFAULT_SSO_ROLE='editor' with empty groupIds", () => {
    vi.stubEnv("ASAFE_DEFAULT_SSO_ROLE", "editor");

    expect(roleFromEntraClaims([])).toBe("editor");
  });

  it("ignores whitespace around group IDs in env vars", () => {
    vi.stubEnv("ASAFE_ENTRA_ADMIN_GROUP_IDS", " admin-group-1 , admin-group-2 ");

    expect(roleFromEntraClaims(["admin-group-1"])).toBe("admin");
  });

  it("returns 'user' when ASAFE_DEFAULT_SSO_ROLE is an unrecognised value", () => {
    vi.stubEnv("ASAFE_DEFAULT_SSO_ROLE", "superadmin");

    expect(roleFromEntraClaims([])).toBe("user");
  });
});

// ---------------------------------------------------------------------------
// Helper: build a minimal JWT-like string with a valid base64url-encoded payload
// ---------------------------------------------------------------------------
function buildFakeJwt(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const payloadEncoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = "fakesignature";
  return `${header}.${payloadEncoded}.${signature}`;
}

describe("parseJwtClaims", () => {
  it("returns decoded payload for a valid JWT-like string", () => {
    const claims = { sub: "user-123", roles: ["editor"], iat: 1_700_000_000 };
    const token = buildFakeJwt(claims);

    const result = parseJwtClaims(token);

    expect(result).not.toBeNull();
    expect(result?.sub).toBe("user-123");
    expect(result?.roles).toEqual(["editor"]);
    expect(result?.iat).toBe(1_700_000_000);
  });

  it("returns null for a completely invalid string (no dots)", () => {
    expect(parseJwtClaims("not-a-jwt")).toBeNull();
  });

  it("returns null when the payload segment is not valid base64url JSON", () => {
    // header.bad-payload.sig
    expect(parseJwtClaims("aGVhZGVy.!!!notbase64!!!.c2ln")).toBeNull();
  });

  it("returns null for an empty string", () => {
    expect(parseJwtClaims("")).toBeNull();
  });

  it("returns null when there is no payload segment after split (only one part)", () => {
    expect(parseJwtClaims("onlyonepart")).toBeNull();
  });

  it("handles a JWT with nested objects in the payload", () => {
    const claims = {
      sub: "user-456",
      groups: ["g1", "g2"],
      ext: { tenantId: "tenant-abc" },
    };
    const token = buildFakeJwt(claims);

    const result = parseJwtClaims(token);

    expect(result?.ext).toEqual({ tenantId: "tenant-abc" });
  });
});
