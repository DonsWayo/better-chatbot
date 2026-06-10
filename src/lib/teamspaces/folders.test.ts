import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Drizzle mock ──────────────────────────────────────────────────────────────
// Queue-based: every db.select() call dequeues the next prepared row set, so a
// multi-query function (folder fetch → membership check → update …) is fed in
// call order. insert/update/delete record their arguments for assertions.

const h = vi.hoisted(() => {
  const state = {
    selectQueue: [] as unknown[][],
    insertReturning: [] as unknown[],
    updateReturning: [] as unknown[],
  };
  const calls = {
    insertValues: [] as Record<string, unknown>[],
    updateSets: [] as Record<string, unknown>[],
    deleteCount: 0,
  };

  function makeSelectChain() {
    const rows = state.selectQueue.length
      ? (state.selectQueue.shift() as unknown[])
      : [];
    const chain: Record<string, unknown> = {};
    for (const method of [
      "from",
      "where",
      "innerJoin",
      "leftJoin",
      "limit",
      "orderBy",
    ]) {
      chain[method] = vi.fn(() => chain);
    }
    chain.then = (
      onFulfilled: (value: unknown[]) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) => Promise.resolve(rows).then(onFulfilled, onRejected);
    return chain;
  }

  const selectMock = vi.fn(() => makeSelectChain());

  const insertMock = vi.fn(() => ({
    values: vi.fn((values: Record<string, unknown>) => {
      calls.insertValues.push(values);
      return { returning: () => Promise.resolve(state.insertReturning) };
    }),
  }));

  const updateMock = vi.fn(() => ({
    set: vi.fn((set: Record<string, unknown>) => {
      calls.updateSets.push(set);
      return {
        where: vi.fn(() => {
          const promise = Promise.resolve({ rowCount: 1 });
          return Object.assign(promise, {
            returning: () => Promise.resolve(state.updateReturning),
          });
        }),
      };
    }),
  }));

  const deleteMock = vi.fn(() => ({
    where: vi.fn(() => {
      calls.deleteCount += 1;
      return Promise.resolve();
    }),
  }));

  return { state, calls, selectMock, insertMock, updateMock, deleteMock };
});

const { state, calls, selectMock, insertMock, updateMock, deleteMock } = h;

vi.mock("lib/db/pg/db.pg", () => ({
  pgDb: {
    select: h.selectMock,
    insert: h.insertMock,
    update: h.updateMock,
    delete: h.deleteMock,
  },
}));

vi.mock("lib/db/pg/schema.pg", () => ({
  FolderTable: {
    id: "folder.id",
    name: "folder.name",
    parentId: "folder.parentId",
    teamId: "folder.teamId",
    ownerId: "folder.ownerId",
  },
  ChatThreadTable: {
    id: "thread.id",
    title: "thread.title",
    userId: "thread.userId",
    folderId: "thread.folderId",
    visibility: "thread.visibility",
    createdAt: "thread.createdAt",
  },
  AsafeTeamTable: { id: "team.id", name: "team.name" },
  AsafeTeamMemberTable: {
    teamId: "member.teamId",
    userId: "member.userId",
    role: "member.role",
  },
}));

vi.mock("drizzle-orm", () => ({
  and: vi.fn(() => ({})),
  eq: vi.fn(() => ({})),
  or: vi.fn(() => ({})),
  inArray: vi.fn(() => ({})),
  isNull: vi.fn(() => ({})),
}));

vi.mock("server-only", () => ({}));

import {
  canReadThread,
  createFolder,
  deleteFolder,
  getThreadTeam,
  listFoldersForUser,
  listThreadsInFolder,
  moveThreadToFolder,
  renameFolder,
  setThreadVisibility,
} from "./folders";

const OWNER = "user-owner";
const MEMBER = "user-member";
const ADMIN = "user-admin";
const STRANGER = "user-stranger";
const TEAM = "team-1";

const personalFolder = {
  id: "folder-personal",
  name: "Mine",
  parentId: null,
  teamId: null,
  ownerId: OWNER,
  visibility: "private",
};

const teamFolder = {
  id: "folder-team",
  name: "Shared",
  parentId: null,
  teamId: TEAM,
  ownerId: OWNER,
  visibility: "team",
};

beforeEach(() => {
  vi.clearAllMocks();
  state.selectQueue = [];
  state.insertReturning = [];
  state.updateReturning = [];
  calls.insertValues = [];
  calls.updateSets = [];
  calls.deleteCount = 0;
});

// ── createFolder ──────────────────────────────────────────────────────────────

describe("createFolder", () => {
  it("creates a personal folder owned by the caller with private visibility", async () => {
    state.insertReturning = [personalFolder];
    const result = await createFolder({ name: "Mine", userId: OWNER });
    expect(result).toEqual(personalFolder);
    expect(calls.insertValues[0]).toMatchObject({
      name: "Mine",
      ownerId: OWNER,
      teamId: null,
      parentId: null,
      visibility: "private",
    });
  });

  it("creates a team folder with team visibility when the caller is a member", async () => {
    state.selectQueue = [[{ role: "member" }]];
    state.insertReturning = [teamFolder];
    await createFolder({ name: "Shared", userId: MEMBER, teamId: TEAM });
    expect(calls.insertValues[0]).toMatchObject({
      teamId: TEAM,
      visibility: "team",
      ownerId: MEMBER,
    });
  });

  it("rejects a team folder when the caller is not a member of the team", async () => {
    state.selectQueue = [[]]; // no membership row
    await expect(
      createFolder({ name: "Nope", userId: STRANGER, teamId: TEAM }),
    ).rejects.toThrow("not a member");
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("rejects an empty name", async () => {
    await expect(createFolder({ name: "   ", userId: OWNER })).rejects.toThrow(
      "name is required",
    );
  });

  it("rejects a missing parent folder", async () => {
    state.selectQueue = [[]]; // parent lookup -> none
    await expect(
      createFolder({ name: "Child", userId: OWNER, parentId: "missing" }),
    ).rejects.toThrow("Parent folder not found");
  });

  it("rejects a parent that belongs to a different teamspace", async () => {
    state.selectQueue = [[{ role: "member" }], [personalFolder]];
    await expect(
      createFolder({
        name: "Child",
        userId: OWNER,
        teamId: TEAM,
        parentId: personalFolder.id,
      }),
    ).rejects.toThrow("different teamspace");
  });

  it("rejects nesting inside someone else's personal folder", async () => {
    state.selectQueue = [[{ ...personalFolder, ownerId: STRANGER }]];
    await expect(
      createFolder({
        name: "Child",
        userId: OWNER,
        parentId: personalFolder.id,
      }),
    ).rejects.toThrow("cannot create folders inside");
  });
});

// ── renameFolder / deleteFolder permission matrix ────────────────────────────

describe("renameFolder", () => {
  it("allows the folder owner", async () => {
    state.selectQueue = [[personalFolder]];
    state.updateReturning = [{ ...personalFolder, name: "Renamed" }];
    const result = await renameFolder(personalFolder.id, "Renamed", OWNER);
    expect(result.name).toBe("Renamed");
    expect(calls.updateSets[0]).toMatchObject({ name: "Renamed" });
  });

  it("allows a team admin who is not the owner", async () => {
    state.selectQueue = [[teamFolder], [{ role: "admin" }]];
    state.updateReturning = [{ ...teamFolder, name: "Renamed" }];
    await expect(
      renameFolder(teamFolder.id, "Renamed", ADMIN),
    ).resolves.toMatchObject({ name: "Renamed" });
  });

  it("rejects a plain team member who is not the owner", async () => {
    state.selectQueue = [[teamFolder], [{ role: "member" }]];
    await expect(
      renameFolder(teamFolder.id, "Renamed", MEMBER),
    ).rejects.toThrow("permission");
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("rejects a non-member", async () => {
    state.selectQueue = [[teamFolder], []];
    await expect(
      renameFolder(teamFolder.id, "Renamed", STRANGER),
    ).rejects.toThrow("permission");
  });

  it("throws when the folder does not exist", async () => {
    state.selectQueue = [[]];
    await expect(renameFolder("missing", "X", OWNER)).rejects.toThrow(
      "Folder not found",
    );
  });
});

describe("deleteFolder", () => {
  it("allows the owner and resets contained threads to private before deleting", async () => {
    state.selectQueue = [[personalFolder]];
    await deleteFolder(personalFolder.id, OWNER);
    expect(calls.updateSets[0]).toEqual({ visibility: "private" });
    expect(calls.deleteCount).toBe(1);
  });

  it("allows a team admin who is not the owner", async () => {
    state.selectQueue = [[teamFolder], [{ role: "admin" }]];
    await deleteFolder(teamFolder.id, ADMIN);
    expect(calls.deleteCount).toBe(1);
  });

  it("rejects a plain member and a non-member", async () => {
    state.selectQueue = [[teamFolder], [{ role: "member" }]];
    await expect(deleteFolder(teamFolder.id, MEMBER)).rejects.toThrow(
      "permission",
    );
    state.selectQueue = [[teamFolder], []];
    await expect(deleteFolder(teamFolder.id, STRANGER)).rejects.toThrow(
      "permission",
    );
    expect(calls.deleteCount).toBe(0);
  });
});

// ── listFoldersForUser ────────────────────────────────────────────────────────

describe("listFoldersForUser", () => {
  it("returns personal folders plus team folders with resolved team names", async () => {
    state.selectQueue = [
      [{ id: TEAM, name: "Platform", role: "member" }], // user teams
      [personalFolder, teamFolder], // folders
    ];
    const result = await listFoldersForUser(MEMBER);
    expect(result).toHaveLength(2);
    expect(result.find((f) => f.id === teamFolder.id)?.teamName).toBe(
      "Platform",
    );
    expect(result.find((f) => f.id === personalFolder.id)?.teamName).toBeNull();
  });

  it("returns only personal folders when the user belongs to no team", async () => {
    state.selectQueue = [[], [personalFolder]];
    const result = await listFoldersForUser(OWNER);
    expect(result).toEqual([{ ...personalFolder, teamName: null }]);
  });
});

// ── moveThreadToFolder visibility rule (both directions) ────────────────────

describe("moveThreadToFolder", () => {
  const ownThread = {
    id: "thread-1",
    userId: OWNER,
    folderId: null,
    visibility: "private",
  };

  it("rejects anyone who is not the thread owner", async () => {
    state.selectQueue = [[ownThread]];
    await expect(
      moveThreadToFolder(ownThread.id, teamFolder.id, MEMBER),
    ).rejects.toThrow("Only the thread owner");
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("moving INTO a team folder sets visibility to team", async () => {
    state.selectQueue = [[ownThread], [teamFolder]];
    await moveThreadToFolder(ownThread.id, teamFolder.id, OWNER);
    expect(calls.updateSets[0]).toEqual({
      folderId: teamFolder.id,
      visibility: "team",
    });
  });

  it("requires team membership when moving into a team folder you do not own", async () => {
    const strangersThread = { ...ownThread, userId: STRANGER };
    state.selectQueue = [
      [strangersThread],
      [{ ...teamFolder, ownerId: OWNER }],
      [], // membership lookup -> none
    ];
    await expect(
      moveThreadToFolder(strangersThread.id, teamFolder.id, STRANGER),
    ).rejects.toThrow("access");
  });

  it("moving OUT of folders (null) resets visibility to private", async () => {
    state.selectQueue = [
      [{ ...ownThread, folderId: teamFolder.id, visibility: "team" }],
    ];
    await moveThreadToFolder(ownThread.id, null, OWNER);
    expect(calls.updateSets[0]).toEqual({
      folderId: null,
      visibility: "private",
    });
  });

  it("moving into a personal folder keeps visibility private", async () => {
    state.selectQueue = [
      [{ ...ownThread, visibility: "team" }],
      [personalFolder],
    ];
    await moveThreadToFolder(ownThread.id, personalFolder.id, OWNER);
    expect(calls.updateSets[0]).toEqual({
      folderId: personalFolder.id,
      visibility: "private",
    });
  });

  it("throws when the thread does not exist", async () => {
    state.selectQueue = [[]];
    await expect(moveThreadToFolder("missing", null, OWNER)).rejects.toThrow(
      "Thread not found",
    );
  });

  it("throws when the target folder does not exist", async () => {
    state.selectQueue = [[ownThread], []];
    await expect(
      moveThreadToFolder(ownThread.id, "missing", OWNER),
    ).rejects.toThrow("Folder not found");
  });
});

// ── setThreadVisibility ──────────────────────────────────────────────────────

describe("setThreadVisibility", () => {
  const sharedThread = {
    id: "thread-2",
    userId: OWNER,
    folderId: teamFolder.id,
    visibility: "private",
  };

  it("owner can share a thread living in a team folder they belong to", async () => {
    state.selectQueue = [[sharedThread], [teamFolder], [{ role: "member" }]];
    await setThreadVisibility(sharedThread.id, "team", OWNER);
    expect(calls.updateSets[0]).toEqual({ visibility: "team" });
  });

  it("rejects non-owners", async () => {
    state.selectQueue = [[sharedThread]];
    await expect(
      setThreadVisibility(sharedThread.id, "team", MEMBER),
    ).rejects.toThrow("Only the thread owner");
  });

  it("rejects sharing a thread that is not in any folder", async () => {
    state.selectQueue = [[{ ...sharedThread, folderId: null }]];
    await expect(
      setThreadVisibility(sharedThread.id, "team", OWNER),
    ).rejects.toThrow("Move the thread into a team folder");
  });

  it("rejects sharing when the folder is not a team folder", async () => {
    state.selectQueue = [
      [{ ...sharedThread, folderId: personalFolder.id }],
      [personalFolder],
    ];
    await expect(
      setThreadVisibility(sharedThread.id, "team", OWNER),
    ).rejects.toThrow("does not belong to a team");
  });

  it("rejects sharing when the owner is no longer a team member", async () => {
    state.selectQueue = [[sharedThread], [teamFolder], []];
    await expect(
      setThreadVisibility(sharedThread.id, "team", OWNER),
    ).rejects.toThrow("not a member");
  });

  it("owner can always reset visibility to private", async () => {
    state.selectQueue = [[{ ...sharedThread, visibility: "team" }]];
    await setThreadVisibility(sharedThread.id, "private", OWNER);
    expect(calls.updateSets[0]).toEqual({ visibility: "private" });
  });
});

// ── canReadThread matrix ─────────────────────────────────────────────────────

describe("canReadThread", () => {
  const teamThread = {
    id: "thread-3",
    userId: OWNER,
    folderId: teamFolder.id,
    visibility: "team",
  };

  it("owner can read their own thread regardless of visibility", async () => {
    state.selectQueue = [[{ ...teamThread, visibility: "private" }]];
    await expect(canReadThread(teamThread.id, OWNER)).resolves.toBe(true);
  });

  it("team member can read a team-visible thread in a team folder", async () => {
    state.selectQueue = [[teamThread], [teamFolder], [{ role: "member" }]];
    await expect(canReadThread(teamThread.id, MEMBER)).resolves.toBe(true);
  });

  it("non-member cannot read a team-visible thread", async () => {
    state.selectQueue = [[teamThread], [teamFolder], []];
    await expect(canReadThread(teamThread.id, STRANGER)).resolves.toBe(false);
  });

  it("private thread is not readable by others, even teammates", async () => {
    state.selectQueue = [[{ ...teamThread, visibility: "private" }]];
    await expect(canReadThread(teamThread.id, MEMBER)).resolves.toBe(false);
  });

  it("team visibility without a folder is inert", async () => {
    state.selectQueue = [[{ ...teamThread, folderId: null }]];
    await expect(canReadThread(teamThread.id, MEMBER)).resolves.toBe(false);
  });

  it("team visibility inside a personal folder is inert", async () => {
    state.selectQueue = [
      [{ ...teamThread, folderId: personalFolder.id }],
      [personalFolder],
    ];
    await expect(canReadThread(teamThread.id, MEMBER)).resolves.toBe(false);
  });

  it("missing thread is not readable", async () => {
    state.selectQueue = [[]];
    await expect(canReadThread("missing", OWNER)).resolves.toBe(false);
  });
});

// ── getThreadTeam ────────────────────────────────────────────────────────────

describe("getThreadTeam", () => {
  it("resolves the team of the containing folder", async () => {
    state.selectQueue = [
      [{ id: "thread-4", userId: OWNER, folderId: teamFolder.id }],
      [teamFolder],
      [{ id: TEAM, name: "Platform" }],
    ];
    await expect(getThreadTeam("thread-4")).resolves.toEqual({
      id: TEAM,
      name: "Platform",
    });
  });

  it("returns null for folderless or personal-folder threads", async () => {
    state.selectQueue = [[{ id: "thread-5", userId: OWNER, folderId: null }]];
    await expect(getThreadTeam("thread-5")).resolves.toBeNull();
  });
});

// ── listThreadsInFolder ──────────────────────────────────────────────────────

describe("listThreadsInFolder", () => {
  const ownRow = {
    id: "t-own",
    title: "Mine",
    userId: MEMBER,
    visibility: "private",
    createdAt: new Date(),
  };
  const sharedRow = {
    id: "t-shared",
    title: "Teammate's",
    userId: OWNER,
    visibility: "team",
    createdAt: new Date(),
  };

  it("team member sees own threads plus teammates' team-visible threads", async () => {
    state.selectQueue = [
      [teamFolder],
      [{ role: "member" }],
      [ownRow, sharedRow],
    ];
    const result = await listThreadsInFolder(teamFolder.id, MEMBER);
    expect(result.map((r) => r.id)).toEqual([ownRow.id, sharedRow.id]);
  });

  it("rejects access to someone else's personal folder", async () => {
    state.selectQueue = [[personalFolder]];
    await expect(
      listThreadsInFolder(personalFolder.id, STRANGER),
    ).rejects.toThrow("access");
  });

  it("rejects non-members of a team folder", async () => {
    state.selectQueue = [[{ ...teamFolder, ownerId: OWNER }], []];
    await expect(listThreadsInFolder(teamFolder.id, STRANGER)).rejects.toThrow(
      "access",
    );
  });

  it("throws when the folder does not exist", async () => {
    state.selectQueue = [[]];
    await expect(listThreadsInFolder("missing", OWNER)).rejects.toThrow(
      "Folder not found",
    );
  });
});

// sanity: the mocks above are actually exercised
describe("mock plumbing", () => {
  it("select/insert/update/delete mocks are wired", () => {
    expect(selectMock).toBeDefined();
    expect(deleteMock).toBeDefined();
  });
});
