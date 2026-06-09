import type { MCPServerConfig, MCPToolInfo } from "app-types/mcp";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Drizzle mock chain ─────────────────────────────────────────────────────────
// insert().values(v).returning() → Promise<rows>
// update().set(v).where(cond).returning() → Promise<rows>
//
// We capture the argument passed to `.values(...)` / `.set(...)` so we can
// assert precisely on the persisted row (the whole point of these tests: the
// team-scoping bug must be caught at this exact boundary).

const insertReturningMock = vi.fn();
const insertValuesMock = vi
  .fn()
  .mockReturnValue({ returning: insertReturningMock });
const insertMock = vi.fn().mockReturnValue({ values: insertValuesMock });

const updateReturningMock = vi.fn();
const updateWhereMock = vi
  .fn()
  .mockReturnValue({ returning: updateReturningMock });
const updateSetMock = vi.fn().mockReturnValue({ where: updateWhereMock });
const updateMock = vi.fn().mockReturnValue({ set: updateSetMock });

vi.mock("lib/db/pg/db.pg", () => ({
  pgDb: {
    insert: insertMock,
    update: updateMock,
  },
}));

vi.mock("lib/db/pg/schema.pg", () => ({
  McpServerTable: {
    id: "id",
    scope: "scope",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(() => ({})),
  and: vi.fn((...args: unknown[]) => ({ _and: args })),
  inArray: vi.fn((...args: unknown[]) => ({ _inArray: args })),
}));

vi.mock("server-only", () => ({}));

const CONFIG: MCPServerConfig = {
  url: "https://example.com/mcp",
} as unknown as MCPServerConfig;

const TOOL_INFO: MCPToolInfo[] = [
  { name: "search", description: "Search the web" },
  { name: "fetch", description: "Fetch a URL" },
];

/** Helper: the single object handed to `.values(...)` on the latest insert. */
function lastInsertValues(): Record<string, unknown> {
  const call = insertValuesMock.mock.calls.at(-1);
  if (!call) throw new Error("insert .values was never called");
  return call[0] as Record<string, unknown>;
}

/** Helper: the single object handed to `.set(...)` on the latest update. */
function lastUpdateSet(): Record<string, unknown> {
  const call = updateSetMock.mock.calls.at(-1);
  if (!call) throw new Error("update .set was never called");
  return call[0] as Record<string, unknown>;
}

beforeEach(() => {
  vi.clearAllMocks();
  insertReturningMock.mockResolvedValue([{ id: "srv-1" }]);
  insertValuesMock.mockReturnValue({ returning: insertReturningMock });
  insertMock.mockReturnValue({ values: insertValuesMock });
  updateReturningMock.mockResolvedValue([{ id: "srv-1" }]);
  updateWhereMock.mockReturnValue({ returning: updateReturningMock });
  updateSetMock.mockReturnValue({ where: updateWhereMock });
  updateMock.mockReturnValue({ set: updateSetMock });
});

describe("registerMcpServer — team scoping (the production bug)", () => {
  it("team scope with multiple teamIds stores all teamIds and sets teamId=first", async () => {
    const { registerMcpServer } = await import("./mcp-servers");
    await registerMcpServer({
      name: "team-mcp",
      scope: "team",
      teamIds: ["team-a", "team-b", "team-c"],
      config: CONFIG,
      enabled: true,
      userId: "user-1",
    });

    const values = lastInsertValues();
    expect(values.teamIds).toEqual(["team-a", "team-b", "team-c"]);
    // Legacy single column must be kept in sync with the first team.
    expect(values.teamId).toBe("team-a");
    expect(values.scope).toBe("team");
  });

  it("team scope with a single team → teamIds=[id] and teamId=id", async () => {
    const { registerMcpServer } = await import("./mcp-servers");
    await registerMcpServer({
      name: "single-team-mcp",
      scope: "team",
      teamIds: ["team-solo"],
      config: CONFIG,
      enabled: true,
      userId: "user-1",
    });

    const values = lastInsertValues();
    expect(values.teamIds).toEqual(["team-solo"]);
    expect(values.teamId).toBe("team-solo");
  });

  it("org scope → teamId=null and teamIds=null even if teamIds are passed", async () => {
    const { registerMcpServer } = await import("./mcp-servers");
    await registerMcpServer({
      name: "org-mcp",
      scope: "org",
      // Defensive: callers should not send these for org, but if they do they
      // must be ignored entirely.
      teamIds: ["leaked-team"],
      config: CONFIG,
      enabled: true,
      userId: "user-1",
    });

    const values = lastInsertValues();
    expect(values.teamId).toBeNull();
    expect(values.teamIds).toBeNull();
    expect(values.scope).toBe("org");
  });

  it("team scope filters falsy entries from teamIds", async () => {
    const { registerMcpServer } = await import("./mcp-servers");
    await registerMcpServer({
      name: "dirty-teams-mcp",
      scope: "team",
      teamIds: [
        "",
        "team-real",
        undefined as unknown as string,
        "",
        "team-real-2",
      ],
      config: CONFIG,
      enabled: true,
      userId: "user-1",
    });

    const values = lastInsertValues();
    expect(values.teamIds).toEqual(["team-real", "team-real-2"]);
    expect(values.teamId).toBe("team-real");
  });

  it("team scope with only-falsy teamIds collapses to null/null", async () => {
    const { registerMcpServer } = await import("./mcp-servers");
    await registerMcpServer({
      name: "empty-after-filter",
      scope: "team",
      teamIds: ["", undefined as unknown as string, null as unknown as string],
      config: CONFIG,
      enabled: true,
      userId: "user-1",
    });

    const values = lastInsertValues();
    expect(values.teamIds).toBeNull();
    expect(values.teamId).toBeNull();
  });

  it("team scope with missing teamIds collapses to null/null", async () => {
    const { registerMcpServer } = await import("./mcp-servers");
    await registerMcpServer({
      name: "no-teamids",
      scope: "team",
      config: CONFIG,
      enabled: true,
      userId: "user-1",
    });

    const values = lastInsertValues();
    expect(values.teamIds).toBeNull();
    expect(values.teamId).toBeNull();
  });
});

describe("registerMcpServer — connection probe persistence", () => {
  it("persists lastConnectionStatus and toolInfo; sets toolInfoUpdatedAt when toolInfo present", async () => {
    const { registerMcpServer } = await import("./mcp-servers");
    await registerMcpServer({
      name: "connected-mcp",
      scope: "org",
      config: CONFIG,
      enabled: true,
      userId: "user-1",
      lastConnectionStatus: "connected",
      toolInfo: TOOL_INFO,
    });

    const values = lastInsertValues();
    expect(values.lastConnectionStatus).toBe("connected");
    expect(values.toolInfo).toEqual(TOOL_INFO);
    expect(values.toolInfoUpdatedAt).toBeInstanceOf(Date);
  });

  it("leaves toolInfoUpdatedAt null when no toolInfo is provided", async () => {
    const { registerMcpServer } = await import("./mcp-servers");
    await registerMcpServer({
      name: "error-mcp",
      scope: "org",
      config: CONFIG,
      enabled: false,
      userId: "user-1",
      lastConnectionStatus: "error",
    });

    const values = lastInsertValues();
    expect(values.lastConnectionStatus).toBe("error");
    expect(values.toolInfo).toBeNull();
    expect(values.toolInfoUpdatedAt).toBeNull();
  });

  it("defaults lastConnectionStatus and toolInfo to null when omitted", async () => {
    const { registerMcpServer } = await import("./mcp-servers");
    await registerMcpServer({
      name: "bare-mcp",
      scope: "org",
      config: CONFIG,
      enabled: true,
      userId: "user-1",
    });

    const values = lastInsertValues();
    expect(values.lastConnectionStatus).toBeNull();
    expect(values.toolInfo).toBeNull();
    expect(values.toolInfoUpdatedAt).toBeNull();
  });

  it("forwards name, config, enabled, and userId to the row", async () => {
    const { registerMcpServer } = await import("./mcp-servers");
    await registerMcpServer({
      name: "passthrough-mcp",
      scope: "org",
      config: CONFIG,
      enabled: false,
      userId: "user-xyz",
    });

    const values = lastInsertValues();
    expect(values.name).toBe("passthrough-mcp");
    expect(values.config).toBe(CONFIG);
    expect(values.enabled).toBe(false);
    expect(values.userId).toBe("user-xyz");
  });

  it("returns the inserted row", async () => {
    insertReturningMock.mockResolvedValue([{ id: "srv-returned", name: "x" }]);
    const { registerMcpServer } = await import("./mcp-servers");
    const result = await registerMcpServer({
      name: "x",
      scope: "org",
      config: CONFIG,
      enabled: true,
      userId: "user-1",
    });
    expect(result).toEqual({ id: "srv-returned", name: "x" });
  });
});

describe("updateMcpServer — teamId / teamIds sync", () => {
  it("patching teamIds syncs teamId to the first entry", async () => {
    const { updateMcpServer } = await import("./mcp-servers");
    await updateMcpServer("srv-1", { teamIds: ["team-x", "team-y"] });

    const set = lastUpdateSet();
    expect(set.teamIds).toEqual(["team-x", "team-y"]);
    expect(set.teamId).toBe("team-x");
    expect(set.updatedAt).toBeInstanceOf(Date);
  });

  it("empty teamIds array → both teamId and teamIds become null", async () => {
    const { updateMcpServer } = await import("./mcp-servers");
    await updateMcpServer("srv-1", { teamIds: [] });

    const set = lastUpdateSet();
    expect(set.teamIds).toBeNull();
    expect(set.teamId).toBeNull();
  });

  it("teamIds=null → both teamId and teamIds become null", async () => {
    const { updateMcpServer } = await import("./mcp-servers");
    await updateMcpServer("srv-1", { teamIds: null });

    const set = lastUpdateSet();
    expect(set.teamIds).toBeNull();
    expect(set.teamId).toBeNull();
  });

  it("patch without teamIds leaves teamId/teamIds untouched (no sync keys set)", async () => {
    const { updateMcpServer } = await import("./mcp-servers");
    await updateMcpServer("srv-1", { name: "renamed", enabled: false });

    const set = lastUpdateSet();
    expect(set.name).toBe("renamed");
    expect(set.enabled).toBe(false);
    // teamSync was empty: neither key should be present on the set payload.
    expect("teamId" in set).toBe(false);
    expect("teamIds" in set).toBe(false);
    expect(set.updatedAt).toBeInstanceOf(Date);
  });

  it("returns the updated row when one exists", async () => {
    updateReturningMock.mockResolvedValue([{ id: "srv-1", name: "after" }]);
    const { updateMcpServer } = await import("./mcp-servers");
    const result = await updateMcpServer("srv-1", { name: "after" });
    expect(result).toEqual({ id: "srv-1", name: "after" });
  });

  it("returns null when no row matched", async () => {
    updateReturningMock.mockResolvedValue([]);
    const { updateMcpServer } = await import("./mcp-servers");
    const result = await updateMcpServer("missing", { name: "x" });
    expect(result).toBeNull();
  });
});
