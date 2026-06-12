import { beforeEach, describe, expect, it, vi } from "vitest";

// resolveEffectiveModelAllowList composes the two model-policy layers with the
// additive user-grant layer; both dependencies are mocked so each scenario can
// be fed independently (same pattern as model-policy.test.ts).

const h = vi.hoisted(() => ({
  getOrgBaseModelAllowListMock: vi.fn(),
  resolveTeamModelAllowListMock: vi.fn(),
  getUserModelGrantsMock: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("./model-policy", () => ({
  getOrgBaseModelAllowList: h.getOrgBaseModelAllowListMock,
  resolveTeamModelAllowList: h.resolveTeamModelAllowListMock,
}));

vi.mock("./user-grants", () => ({
  getUserModelGrants: h.getUserModelGrantsMock,
}));

const loggerErrorMock = vi.hoisted(() => vi.fn());
vi.mock("logger", () => ({
  default: {
    withDefaults: () => ({
      error: loggerErrorMock,
      warn: vi.fn(),
      info: vi.fn(),
      debug: vi.fn(),
    }),
  },
}));

import { resolveEffectiveModelAllowList } from "./effective-models";

const {
  getOrgBaseModelAllowListMock,
  resolveTeamModelAllowListMock,
  getUserModelGrantsMock,
} = h;

beforeEach(() => {
  vi.clearAllMocks();
  getOrgBaseModelAllowListMock.mockResolvedValue(null);
  resolveTeamModelAllowListMock.mockResolvedValue(null);
  getUserModelGrantsMock.mockResolvedValue([]);
});

describe("resolveEffectiveModelAllowList", () => {
  it("uses the team-resolved list when a teamId is given", async () => {
    resolveTeamModelAllowListMock.mockResolvedValue(["gpt-5.5"]);
    await expect(
      resolveEffectiveModelAllowList("u1", "team-1"),
    ).resolves.toEqual(["gpt-5.5"]);
    expect(resolveTeamModelAllowListMock).toHaveBeenCalledWith("team-1");
    expect(getOrgBaseModelAllowListMock).not.toHaveBeenCalled();
  });

  it("falls back to the org base when the user has no team", async () => {
    getOrgBaseModelAllowListMock.mockResolvedValue(["gpt-5.5"]);
    await expect(resolveEffectiveModelAllowList("u1", null)).resolves.toEqual([
      "gpt-5.5",
    ]);
    expect(getOrgBaseModelAllowListMock).toHaveBeenCalled();
    expect(resolveTeamModelAllowListMock).not.toHaveBeenCalled();
  });

  it("returns null (unrestricted) when no layer restricts — grants not consulted", async () => {
    resolveTeamModelAllowListMock.mockResolvedValue(null);
    await expect(
      resolveEffectiveModelAllowList("u1", "team-1"),
    ).resolves.toBeNull();
    // Grants are additive; they can never NARROW an unrestricted list.
    expect(getUserModelGrantsMock).not.toHaveBeenCalled();
  });

  it("normalizes a legacy empty list to null (empty = unrestricted)", async () => {
    resolveTeamModelAllowListMock.mockResolvedValue([]);
    await expect(
      resolveEffectiveModelAllowList("u1", "team-1"),
    ).resolves.toBeNull();
    expect(getUserModelGrantsMock).not.toHaveBeenCalled();
  });

  it("user grants ADD models on top of the team list (ERP price-list style)", async () => {
    resolveTeamModelAllowListMock.mockResolvedValue(["gpt-5.5"]);
    getUserModelGrantsMock.mockResolvedValue(["claude-opus-4.8"]);
    await expect(
      resolveEffectiveModelAllowList("u1", "team-1"),
    ).resolves.toEqual(["gpt-5.5", "claude-opus-4.8"]);
    expect(getUserModelGrantsMock).toHaveBeenCalledWith("u1");
  });

  it("dedupes a grant that the team list already contains", async () => {
    resolveTeamModelAllowListMock.mockResolvedValue(["gpt-5.5", "o4-mini"]);
    getUserModelGrantsMock.mockResolvedValue(["o4-mini", "claude-opus-4.8"]);
    await expect(
      resolveEffectiveModelAllowList("u1", "team-1"),
    ).resolves.toEqual(["gpt-5.5", "o4-mini", "claude-opus-4.8"]);
  });

  it("grants also layer on top of the org base when there is no team", async () => {
    getOrgBaseModelAllowListMock.mockResolvedValue(["gemini-3.5-flash"]);
    getUserModelGrantsMock.mockResolvedValue(["claude-opus-4.8"]);
    await expect(resolveEffectiveModelAllowList("u1")).resolves.toEqual([
      "gemini-3.5-flash",
      "claude-opus-4.8",
    ]);
  });

  it("fails open on a grants-table error: the team list still applies", async () => {
    resolveTeamModelAllowListMock.mockResolvedValue(["gpt-5.5"]);
    getUserModelGrantsMock.mockRejectedValue(new Error("db down"));
    await expect(
      resolveEffectiveModelAllowList("u1", "team-1"),
    ).resolves.toEqual(["gpt-5.5"]);
  });

  it("logs an error when the grants table read fails (observable fail-open)", async () => {
    loggerErrorMock.mockClear();
    resolveTeamModelAllowListMock.mockResolvedValue(["gpt-5.5"]);
    getUserModelGrantsMock.mockRejectedValue(new Error("db down"));
    await resolveEffectiveModelAllowList("u1", "team-1");
    expect(loggerErrorMock).toHaveBeenCalled();
  });
});
