import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Drizzle mock chain ────────────────────────────────────────────────────────
// select({...}).from(T).where(...) is awaited directly for grants and via
// .limit(1) for entity/user lookups, so where() returns a thenable that ALSO
// carries a limit() method. Which rows come back depends on the (mocked)
// table passed to from(), tagged via `_tbl`.

const h = vi.hoisted(() => {
  const state = {
    workflowRows: [] as unknown[],
    agentRows: [] as unknown[],
    knowledgeRows: [] as unknown[],
    userRows: [] as unknown[],
    grantRows: [] as unknown[],
  };

  const rowsFor = (tbl: string | undefined): unknown[] => {
    switch (tbl) {
      case "workflow":
        return state.workflowRows;
      case "agent":
        return state.agentRows;
      case "knowledge":
        return state.knowledgeRows;
      case "user":
        return state.userRows;
      case "grant":
        return state.grantRows;
      default:
        return [];
    }
  };

  const fromMock = vi.fn((table: { _tbl?: string } | undefined) => ({
    where: vi.fn(() => {
      const rows = rowsFor(table?._tbl);
      return Object.assign(Promise.resolve(rows), {
        limit: vi.fn(() => Promise.resolve(rows)),
      });
    }),
  }));
  const selectMock = vi.fn().mockReturnValue({ from: fromMock });

  const onConflictDoNothingMock = vi.fn().mockResolvedValue(undefined);
  const insertValuesMock = vi
    .fn()
    .mockReturnValue({ onConflictDoNothing: onConflictDoNothingMock });
  const insertMock = vi.fn().mockReturnValue({ values: insertValuesMock });

  const deleteWhereMock = vi.fn().mockResolvedValue(undefined);
  const deleteMock = vi.fn().mockReturnValue({ where: deleteWhereMock });

  const listUserTeamsMock = vi.fn();

  return {
    state,
    fromMock,
    selectMock,
    onConflictDoNothingMock,
    insertValuesMock,
    insertMock,
    deleteWhereMock,
    deleteMock,
    listUserTeamsMock,
  };
});

const {
  state,
  fromMock,
  selectMock,
  onConflictDoNothingMock,
  insertValuesMock,
  insertMock,
  deleteWhereMock,
  deleteMock,
  listUserTeamsMock,
} = h;

vi.mock("lib/db/pg/db.pg", () => ({
  pgDb: { select: h.selectMock, insert: h.insertMock, delete: h.deleteMock },
}));

vi.mock("lib/db/pg/schema.pg", () => ({
  WorkflowTable: {
    _tbl: "workflow",
    id: "id",
    userId: "userId",
    visibility: "visibility",
    teamIds: "teamIds",
  },
  AgentTable: {
    _tbl: "agent",
    id: "id",
    userId: "userId",
    visibility: "visibility",
    teamIds: "teamIds",
  },
  AsafeKnowledgeCollectionTable: {
    _tbl: "knowledge",
    id: "id",
    createdBy: "createdBy",
    visibility: "visibility",
    teamIds: "teamIds",
    teamId: "teamId",
  },
  UserTable: { _tbl: "user", id: "id", role: "role" },
  EntityGrantTable: {
    _tbl: "grant",
    entityType: "entityType",
    entityId: "entityId",
    granteeUserId: "granteeUserId",
    capability: "capability",
    grantedBy: "grantedBy",
  },
}));

vi.mock("lib/teamspaces/folders", () => ({
  listUserTeams: h.listUserTeamsMock,
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((_a: unknown, _b: unknown) => ({})),
  and: vi.fn((...args: unknown[]) => ({ args })),
}));

vi.mock("server-only", () => ({}));

import {
  type Capability,
  type ViewerContext,
  type VisibilityEntity,
  canAccess,
  grantAccess,
  knowledgeCollectionEntity,
  listGrants,
  loadViewerContext,
  resolveAccess,
  revokeAccess,
  revokeAllGrants,
} from "./index";

const OWNER = "00000000-0000-0000-0000-00000000aaaa";
const STRANGER = "00000000-0000-0000-0000-00000000bbbb";
const TEAM_A = "00000000-0000-0000-0000-0000000000a1";
const TEAM_B = "00000000-0000-0000-0000-0000000000b2";
const ENTITY_ID = "00000000-0000-0000-0000-00000000eeee";

function entity(overrides: Partial<VisibilityEntity> = {}): VisibilityEntity {
  return { ownerId: OWNER, visibility: "private", teamIds: null, ...overrides };
}

function viewer(overrides: Partial<ViewerContext> = {}): ViewerContext {
  return {
    userId: STRANGER,
    userTeamIds: [],
    isAdmin: false,
    grants: [],
    ...overrides,
  };
}

const ALL_CAPABILITIES: Capability[] = ["view", "use", "edit", "manage"];

beforeEach(() => {
  vi.clearAllMocks();
  state.workflowRows = [];
  state.agentRows = [];
  state.knowledgeRows = [];
  state.userRows = [{ role: "user" }];
  state.grantRows = [];
  listUserTeamsMock.mockResolvedValue([]);
  selectMock.mockReturnValue({ from: fromMock });
  insertMock.mockReturnValue({ values: insertValuesMock });
  insertValuesMock.mockReturnValue({
    onConflictDoNothing: onConflictDoNothingMock,
  });
  deleteMock.mockReturnValue({ where: deleteWhereMock });
});

// ── resolveAccess: private ───────────────────────────────────────────────────

describe("resolveAccess — private", () => {
  it("owner holds every capability", () => {
    for (const cap of ALL_CAPABILITIES) {
      expect(resolveAccess(entity(), viewer({ userId: OWNER }), cap)).toBe(
        true,
      );
    }
  });

  it("admin holds every capability", () => {
    for (const cap of ALL_CAPABILITIES) {
      expect(resolveAccess(entity(), viewer({ isAdmin: true }), cap)).toBe(
        true,
      );
    }
  });

  it("stranger is denied everything", () => {
    for (const cap of ALL_CAPABILITIES) {
      expect(resolveAccess(entity(), viewer(), cap)).toBe(false);
    }
  });

  it("team membership does not help on a private entity", () => {
    expect(
      resolveAccess(
        entity({ teamIds: [TEAM_A] }),
        viewer({ userTeamIds: [TEAM_A] }),
        "view",
      ),
    ).toBe(false);
  });

  it("grants are inert on a private entity (shared-only)", () => {
    expect(
      resolveAccess(
        entity(),
        viewer({ grants: [{ capability: "manage" }] }),
        "view",
      ),
    ).toBe(false);
  });
});

// ── resolveAccess: shared ────────────────────────────────────────────────────

describe("resolveAccess — shared", () => {
  const shared = () => entity({ visibility: "shared" });

  it("a 'use' grant implies view and use, but not edit/manage", () => {
    const v = viewer({ grants: [{ capability: "use" }] });
    expect(resolveAccess(shared(), v, "view")).toBe(true);
    expect(resolveAccess(shared(), v, "use")).toBe(true);
    expect(resolveAccess(shared(), v, "edit")).toBe(false);
    expect(resolveAccess(shared(), v, "manage")).toBe(false);
  });

  it("a 'manage' grant implies the full hierarchy", () => {
    const v = viewer({ grants: [{ capability: "manage" }] });
    for (const cap of ALL_CAPABILITIES) {
      expect(resolveAccess(shared(), v, cap)).toBe(true);
    }
  });

  it("a 'view' grant does not allow use", () => {
    const v = viewer({ grants: [{ capability: "view" }] });
    expect(resolveAccess(shared(), v, "view")).toBe(true);
    expect(resolveAccess(shared(), v, "use")).toBe(false);
  });

  it("the best of multiple grants wins", () => {
    const v = viewer({
      grants: [{ capability: "view" }, { capability: "edit" }],
    });
    expect(resolveAccess(shared(), v, "edit")).toBe(true);
    expect(resolveAccess(shared(), v, "manage")).toBe(false);
  });

  it("no grants → no access for a stranger", () => {
    expect(resolveAccess(shared(), viewer(), "view")).toBe(false);
  });

  it("owner and admin keep manage without grants", () => {
    expect(resolveAccess(shared(), viewer({ userId: OWNER }), "manage")).toBe(
      true,
    );
    expect(resolveAccess(shared(), viewer({ isAdmin: true }), "manage")).toBe(
      true,
    );
  });
});

// ── resolveAccess: team ──────────────────────────────────────────────────────

describe("resolveAccess — team", () => {
  const team = () => entity({ visibility: "team", teamIds: [TEAM_A, TEAM_B] });

  it("a member of ANY listed team can view and use", () => {
    const v = viewer({ userTeamIds: [TEAM_B] });
    expect(resolveAccess(team(), v, "view")).toBe(true);
    expect(resolveAccess(team(), v, "use")).toBe(true);
  });

  it("members cannot edit or manage", () => {
    const v = viewer({ userTeamIds: [TEAM_A] });
    expect(resolveAccess(team(), v, "edit")).toBe(false);
    expect(resolveAccess(team(), v, "manage")).toBe(false);
  });

  it("non-members are denied", () => {
    const v = viewer({ userTeamIds: ["other-team"] });
    expect(resolveAccess(team(), v, "view")).toBe(false);
  });

  it("team visibility with null/empty teamIds is inert for non-owners", () => {
    const v = viewer({ userTeamIds: [TEAM_A] });
    expect(
      resolveAccess(entity({ visibility: "team", teamIds: null }), v, "view"),
    ).toBe(false);
    expect(
      resolveAccess(entity({ visibility: "team", teamIds: [] }), v, "view"),
    ).toBe(false);
  });

  it("owner and admin keep manage", () => {
    expect(resolveAccess(team(), viewer({ userId: OWNER }), "manage")).toBe(
      true,
    );
    expect(resolveAccess(team(), viewer({ isAdmin: true }), "manage")).toBe(
      true,
    );
  });
});

// ── resolveAccess: company ───────────────────────────────────────────────────

describe("resolveAccess — company", () => {
  const company = () => entity({ visibility: "company" });

  it("everyone can view and use", () => {
    expect(resolveAccess(company(), viewer(), "view")).toBe(true);
    expect(resolveAccess(company(), viewer(), "use")).toBe(true);
  });

  it("edit and manage stay with owner + admins", () => {
    expect(resolveAccess(company(), viewer(), "edit")).toBe(false);
    expect(resolveAccess(company(), viewer(), "manage")).toBe(false);
    expect(resolveAccess(company(), viewer({ userId: OWNER }), "edit")).toBe(
      true,
    );
    expect(resolveAccess(company(), viewer({ isAdmin: true }), "manage")).toBe(
      true,
    );
  });
});

// ── resolveAccess: legacy mapping ────────────────────────────────────────────

describe("resolveAccess — legacy visibility mapping", () => {
  it("legacy 'public' resolves as company (view/use for everyone)", () => {
    const e = entity({ visibility: null, legacyVisibility: "public" });
    expect(resolveAccess(e, viewer(), "view")).toBe(true);
    expect(resolveAccess(e, viewer(), "use")).toBe(true);
    expect(resolveAccess(e, viewer(), "edit")).toBe(false);
  });

  it("legacy 'public' passed directly in visibility also maps to company", () => {
    const e = entity({ visibility: "public" });
    expect(resolveAccess(e, viewer(), "use")).toBe(true);
  });

  it("legacy 'readonly' resolves as company capped at view", () => {
    const e = entity({ visibility: "readonly" });
    expect(resolveAccess(e, viewer(), "view")).toBe(true);
    expect(resolveAccess(e, viewer(), "use")).toBe(false);
    expect(resolveAccess(e, viewer({ userId: OWNER }), "manage")).toBe(true);
  });

  it("legacy 'private' resolves as private", () => {
    const e = entity({ visibility: null, legacyVisibility: "private" });
    expect(resolveAccess(e, viewer(), "view")).toBe(false);
    expect(resolveAccess(e, viewer({ userId: OWNER }), "manage")).toBe(true);
  });

  it("unknown / missing visibility fails closed to private", () => {
    expect(
      resolveAccess(entity({ visibility: "banana" }), viewer(), "view"),
    ).toBe(false);
    expect(
      resolveAccess(
        entity({ visibility: null, legacyVisibility: null }),
        viewer(),
        "view",
      ),
    ).toBe(false);
  });

  it("a modern visibility value wins over legacyVisibility", () => {
    const e = entity({ visibility: "company", legacyVisibility: "private" });
    expect(resolveAccess(e, viewer(), "use")).toBe(true);
  });
});

// ── canAccess: DB wiring (workflow + agent) ──────────────────────────────────

describe("canAccess — workflow", () => {
  it("owner gets manage on their private workflow", async () => {
    state.workflowRows = [
      { ownerId: OWNER, visibility: "private", teamIds: null },
    ];
    await expect(
      canAccess("workflow", ENTITY_ID, OWNER, "manage"),
    ).resolves.toBe(true);
  });

  it("stranger can use a legacy-'public' workflow but not edit it", async () => {
    state.workflowRows = [
      { ownerId: OWNER, visibility: "public", teamIds: null },
    ];
    await expect(
      canAccess("workflow", ENTITY_ID, STRANGER, "use"),
    ).resolves.toBe(true);
    await expect(
      canAccess("workflow", ENTITY_ID, STRANGER, "edit"),
    ).resolves.toBe(false);
  });

  it("team member can use a team-visible workflow via teamIds", async () => {
    state.workflowRows = [
      { ownerId: OWNER, visibility: "team", teamIds: [TEAM_A] },
    ];
    listUserTeamsMock.mockResolvedValue([
      { id: TEAM_A, name: "Team A", role: "member" },
    ]);
    await expect(
      canAccess("workflow", ENTITY_ID, STRANGER, "use"),
    ).resolves.toBe(true);
    await expect(
      canAccess("workflow", ENTITY_ID, STRANGER, "manage"),
    ).resolves.toBe(false);
  });

  it("grantee reaches a shared workflow with their granted capability", async () => {
    state.workflowRows = [
      { ownerId: OWNER, visibility: "shared", teamIds: null },
    ];
    state.grantRows = [{ capability: "edit" }];
    await expect(
      canAccess("workflow", ENTITY_ID, STRANGER, "edit"),
    ).resolves.toBe(true);
    await expect(
      canAccess("workflow", ENTITY_ID, STRANGER, "manage"),
    ).resolves.toBe(false);
  });

  it("grants stay inert while the workflow is still private", async () => {
    state.workflowRows = [
      { ownerId: OWNER, visibility: "private", teamIds: null },
    ];
    state.grantRows = [{ capability: "manage" }];
    await expect(
      canAccess("workflow", ENTITY_ID, STRANGER, "view"),
    ).resolves.toBe(false);
  });

  it("unknown workflow → false", async () => {
    state.workflowRows = [];
    await expect(canAccess("workflow", ENTITY_ID, OWNER, "view")).resolves.toBe(
      false,
    );
  });
});

describe("canAccess — agent", () => {
  it("owner gets manage on their agent", async () => {
    state.agentRows = [
      { ownerId: OWNER, visibility: "private", teamIds: null },
    ];
    await expect(canAccess("agent", ENTITY_ID, OWNER, "manage")).resolves.toBe(
      true,
    );
  });

  it("legacy 'readonly' agent: stranger may view but not use", async () => {
    state.agentRows = [
      { ownerId: OWNER, visibility: "readonly", teamIds: null },
    ];
    await expect(canAccess("agent", ENTITY_ID, STRANGER, "view")).resolves.toBe(
      true,
    );
    await expect(canAccess("agent", ENTITY_ID, STRANGER, "use")).resolves.toBe(
      false,
    );
  });

  it("an org admin (user.role contains 'admin') manages any agent", async () => {
    state.agentRows = [
      { ownerId: OWNER, visibility: "private", teamIds: null },
    ];
    state.userRows = [{ role: "admin,editor" }];
    await expect(
      canAccess("agent", ENTITY_ID, STRANGER, "manage"),
    ).resolves.toBe(true);
  });
});

describe("canAccess — unwired entity types fail closed", () => {
  it("thread / folder / mcp_server → false (TODO rounds)", async () => {
    for (const t of ["thread", "folder", "mcp_server"] as const) {
      await expect(canAccess(t, ENTITY_ID, OWNER, "view")).resolves.toBe(false);
    }
  });
});

// ── canAccess: knowledge_collection (Wave 6 phase 2) ─────────────────────────

describe("canAccess — knowledge_collection", () => {
  it("creator gets manage on their private collection", async () => {
    state.knowledgeRows = [
      { ownerId: OWNER, visibility: "private", teamIds: null, teamId: null },
    ];
    await expect(
      canAccess("knowledge_collection", ENTITY_ID, OWNER, "manage"),
    ).resolves.toBe(true);
    await expect(
      canAccess("knowledge_collection", ENTITY_ID, STRANGER, "view"),
    ).resolves.toBe(false);
  });

  it("legacy 'org' visibility reads as company: anyone may view/use, not edit", async () => {
    state.knowledgeRows = [
      { ownerId: OWNER, visibility: "org", teamIds: null, teamId: null },
    ];
    await expect(
      canAccess("knowledge_collection", ENTITY_ID, STRANGER, "view"),
    ).resolves.toBe(true);
    await expect(
      canAccess("knowledge_collection", ENTITY_ID, STRANGER, "use"),
    ).resolves.toBe(true);
    await expect(
      canAccess("knowledge_collection", ENTITY_ID, STRANGER, "edit"),
    ).resolves.toBe(false);
  });

  it("team visibility honours modern teamIds[]", async () => {
    state.knowledgeRows = [
      { ownerId: OWNER, visibility: "team", teamIds: [TEAM_A], teamId: null },
    ];
    listUserTeamsMock.mockResolvedValue([
      { id: TEAM_A, name: "Team A", role: "member" },
    ]);
    await expect(
      canAccess("knowledge_collection", ENTITY_ID, STRANGER, "use"),
    ).resolves.toBe(true);
  });

  it("team visibility falls back to the legacy single teamId column", async () => {
    state.knowledgeRows = [
      { ownerId: OWNER, visibility: "team", teamIds: null, teamId: TEAM_B },
    ];
    listUserTeamsMock.mockResolvedValue([
      { id: TEAM_B, name: "Team B", role: "member" },
    ]);
    await expect(
      canAccess("knowledge_collection", ENTITY_ID, STRANGER, "use"),
    ).resolves.toBe(true);
    listUserTeamsMock.mockResolvedValue([]);
    await expect(
      canAccess("knowledge_collection", ENTITY_ID, STRANGER, "use"),
    ).resolves.toBe(false);
  });

  it("shared visibility honours entity grants", async () => {
    state.knowledgeRows = [
      { ownerId: OWNER, visibility: "shared", teamIds: null, teamId: null },
    ];
    state.grantRows = [{ capability: "use" }];
    await expect(
      canAccess("knowledge_collection", ENTITY_ID, STRANGER, "use"),
    ).resolves.toBe(true);
    await expect(
      canAccess("knowledge_collection", ENTITY_ID, STRANGER, "manage"),
    ).resolves.toBe(false);
  });

  it("org admins manage any collection", async () => {
    state.knowledgeRows = [
      { ownerId: OWNER, visibility: "private", teamIds: null, teamId: null },
    ];
    state.userRows = [{ role: "admin" }];
    await expect(
      canAccess("knowledge_collection", ENTITY_ID, STRANGER, "manage"),
    ).resolves.toBe(true);
  });

  it("unknown collection → false", async () => {
    state.knowledgeRows = [];
    await expect(
      canAccess("knowledge_collection", ENTITY_ID, OWNER, "view"),
    ).resolves.toBe(false);
  });
});

// ── knowledgeCollectionEntity mapping ────────────────────────────────────────

describe("knowledgeCollectionEntity", () => {
  it("prefers modern teamIds[] over the legacy teamId", () => {
    const e = knowledgeCollectionEntity({
      createdBy: OWNER,
      visibility: "team",
      teamIds: [TEAM_A],
      teamId: TEAM_B,
    });
    expect(e.teamIds).toEqual([TEAM_A]);
  });

  it("falls back to [teamId] when teamIds is empty or null", () => {
    expect(
      knowledgeCollectionEntity({
        createdBy: OWNER,
        visibility: "team",
        teamIds: [],
        teamId: TEAM_B,
      }).teamIds,
    ).toEqual([TEAM_B]);
    expect(
      knowledgeCollectionEntity({
        createdBy: OWNER,
        visibility: "team",
        teamIds: null,
        teamId: null,
      }).teamIds,
    ).toBeNull();
  });

  it("null createdBy maps to an unmatchable owner (visibility still applies)", () => {
    const e = knowledgeCollectionEntity({
      createdBy: null,
      visibility: "company",
      teamIds: null,
      teamId: null,
    });
    expect(e.ownerId).toBe("");
    expect(resolveAccess(e, viewer(), "use")).toBe(true);
  });
});

// ── loadViewerContext (list filtering) ───────────────────────────────────────

describe("loadViewerContext", () => {
  it("groups the user's grants by entity id", async () => {
    state.grantRows = [
      { entityId: "col-1", capability: "use" },
      { entityId: "col-1", capability: "edit" },
      { entityId: "col-2", capability: "view" },
    ];
    const ctx = await loadViewerContext("knowledge_collection", STRANGER);
    expect(ctx.grantsByEntityId["col-1"]).toHaveLength(2);
    expect(ctx.grantsByEntityId["col-2"]).toEqual([{ capability: "view" }]);
    expect(ctx.isAdmin).toBe(false);
  });

  it("flags org admins and lists team memberships", async () => {
    state.userRows = [{ role: "admin,editor" }];
    listUserTeamsMock.mockResolvedValue([
      { id: TEAM_A, name: "Team A", role: "member" },
    ]);
    const ctx = await loadViewerContext("knowledge_collection", STRANGER);
    expect(ctx.isAdmin).toBe(true);
    expect(ctx.userTeamIds).toEqual([TEAM_A]);
  });
});

// ── resolveAccess: legacy 'org' mapping ──────────────────────────────────────

describe("resolveAccess — legacy 'org' visibility", () => {
  it("'org' resolves as company (view/use for everyone, edit owner-only)", () => {
    const e = entity({ visibility: "org" });
    expect(resolveAccess(e, viewer(), "view")).toBe(true);
    expect(resolveAccess(e, viewer(), "use")).toBe(true);
    expect(resolveAccess(e, viewer(), "edit")).toBe(false);
    expect(resolveAccess(e, viewer({ userId: OWNER }), "manage")).toBe(true);
  });
});

// ── grant management ─────────────────────────────────────────────────────────

describe("grantAccess", () => {
  const input = {
    entityType: "workflow" as const,
    entityId: ENTITY_ID,
    granteeUserId: STRANGER,
    capability: "use" as const,
    grantedBy: OWNER,
  };

  it("inserts the grant row with the caller as grantedBy", async () => {
    await grantAccess(input);
    expect(insertValuesMock).toHaveBeenCalledWith({
      entityType: "workflow",
      entityId: ENTITY_ID,
      granteeUserId: STRANGER,
      capability: "use",
      grantedBy: OWNER,
    });
  });

  it("is idempotent: conflicts on the unique key do nothing", async () => {
    await grantAccess(input);
    await grantAccess(input);
    expect(insertMock).toHaveBeenCalledTimes(2);
    expect(onConflictDoNothingMock).toHaveBeenCalledTimes(2);
    expect(onConflictDoNothingMock).toHaveBeenCalledWith({
      target: ["entityType", "entityId", "granteeUserId", "capability"],
    });
  });
});

describe("revokeAccess / listGrants", () => {
  it("revokeAccess deletes matching grants (specific capability)", async () => {
    await revokeAccess({
      entityType: "agent",
      entityId: ENTITY_ID,
      granteeUserId: STRANGER,
      capability: "use",
    });
    expect(deleteMock).toHaveBeenCalledTimes(1);
    expect(deleteWhereMock).toHaveBeenCalledTimes(1);
  });

  it("revokeAccess without capability removes all of the grantee's grants", async () => {
    await revokeAccess({
      entityType: "agent",
      entityId: ENTITY_ID,
      granteeUserId: STRANGER,
    });
    expect(deleteWhereMock).toHaveBeenCalledTimes(1);
  });

  it("revokeAllGrants deletes every grant for the entity (revoke-on-private)", async () => {
    await revokeAllGrants("agent", ENTITY_ID);
    expect(deleteMock).toHaveBeenCalledTimes(1);
    expect(deleteWhereMock).toHaveBeenCalledTimes(1);
  });

  it("listGrants returns every grant row for the entity", async () => {
    state.grantRows = [
      { id: "g1", capability: "use", granteeUserId: STRANGER },
      { id: "g2", capability: "edit", granteeUserId: OWNER },
    ];
    const grants = await listGrants("workflow", ENTITY_ID);
    expect(grants).toHaveLength(2);
    expect(grants[0]).toMatchObject({ id: "g1", capability: "use" });
  });
});
