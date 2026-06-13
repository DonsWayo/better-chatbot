import { beforeEach, describe, expect, it, vi } from "vitest";

const { findByPlaintextMock, getUserByIdMock, getUserPrimaryTeamIdMock } =
  vi.hoisted(() => ({
    findByPlaintextMock: vi.fn(),
    getUserByIdMock: vi.fn(),
    getUserPrimaryTeamIdMock: vi.fn(),
  }));

vi.mock("lib/db/pg/repositories/api-key-repository.pg", () => ({
  findByPlaintext: findByPlaintextMock,
  FULL_SCOPE: "*",
}));
vi.mock("lib/db/repository", () => ({
  userRepository: { getUserById: getUserByIdMock },
}));
vi.mock("lib/admin/teams", () => ({
  getUserPrimaryTeamId: getUserPrimaryTeamIdMock,
}));

import {
  authenticateApiKey,
  extractBearerToken,
  hasScope,
  principalCanCreateAgent,
} from "./api-key-auth";

function req(authHeader?: string): Request {
  return new Request("https://x/api/v1/agents", {
    headers: authHeader ? { authorization: authHeader } : {},
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  getUserByIdMock.mockResolvedValue({ id: "u1", role: "editor" });
  getUserPrimaryTeamIdMock.mockResolvedValue("team-primary");
});

describe("extractBearerToken", () => {
  it("pulls the token out of an Authorization header", () => {
    expect(extractBearerToken(req("Bearer ck_live_abc"))).toBe("ck_live_abc");
  });
  it("is case-insensitive on the scheme", () => {
    expect(extractBearerToken(req("bearer ck_live_abc"))).toBe("ck_live_abc");
  });
  it("returns null without a header", () => {
    expect(extractBearerToken(req())).toBeNull();
  });
});

describe("authenticateApiKey", () => {
  it("returns null when no key is presented", async () => {
    await expect(authenticateApiKey(req())).resolves.toBeNull();
    expect(findByPlaintextMock).not.toHaveBeenCalled();
  });

  it("returns null for an invalid/revoked/expired key (repo returns null)", async () => {
    findByPlaintextMock.mockResolvedValueOnce(null);
    await expect(
      authenticateApiKey(req("Bearer ck_live_bad")),
    ).resolves.toBeNull();
  });

  it("returns a principal acting as the key's creating user", async () => {
    findByPlaintextMock.mockResolvedValueOnce({
      id: "key-1",
      createdBy: "u1",
      teamId: null,
      scopes: ["*"],
    });
    const principal = await authenticateApiKey(req("Bearer ck_live_good"));
    expect(principal).toEqual({
      userId: "u1",
      teamId: "team-primary",
      role: "editor",
      keyId: "key-1",
      scopes: ["*"],
    });
  });

  it("pins the key's explicit teamId over the creator's primary team", async () => {
    findByPlaintextMock.mockResolvedValueOnce({
      id: "key-2",
      createdBy: "u1",
      teamId: "team-explicit",
      scopes: ["agents:read"],
    });
    const principal = await authenticateApiKey(req("Bearer ck_live_good"));
    expect(principal?.teamId).toBe("team-explicit");
    expect(getUserPrimaryTeamIdMock).not.toHaveBeenCalled();
  });

  it("defaults to least-privilege role on a user lookup failure", async () => {
    findByPlaintextMock.mockResolvedValueOnce({
      id: "key-3",
      createdBy: "u1",
      teamId: "t",
      scopes: ["*"],
    });
    getUserByIdMock.mockRejectedValueOnce(new Error("db down"));
    const principal = await authenticateApiKey(req("Bearer ck_live_good"));
    expect(principal?.role).toBe("user");
  });
});

describe("hasScope", () => {
  const base = {
    userId: "u1",
    teamId: null,
    role: "user",
    keyId: "k",
  };
  it("full scope * satisfies any scope", () => {
    expect(hasScope({ ...base, scopes: ["*"] }, "sessions:write")).toBe(true);
  });
  it("matches an explicit scope", () => {
    expect(hasScope({ ...base, scopes: ["agents:read"] }, "agents:read")).toBe(
      true,
    );
  });
  it("denies a scope not held", () => {
    expect(
      hasScope({ ...base, scopes: ["agents:read"] }, "sessions:write"),
    ).toBe(false);
  });
});

describe("principalCanCreateAgent", () => {
  const base = { userId: "u1", teamId: null, keyId: "k", scopes: ["*"] };
  it("permits editor and admin", () => {
    expect(principalCanCreateAgent({ ...base, role: "editor" })).toBe(true);
    expect(principalCanCreateAgent({ ...base, role: "admin" })).toBe(true);
  });
  it("denies plain user", () => {
    expect(principalCanCreateAgent({ ...base, role: "user" })).toBe(false);
  });
});
