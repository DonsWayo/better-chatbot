import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the drizzle db so the repository's checkAccess / mutation paths can be
// unit-tested without a live Postgres. Reads are driven by a queue; the last
// update().set().where().returning() value is captured for assertions.
const {
  selectQueue,
  insertValuesReturningMock,
  insertValuesMock,
  updateSetMock,
  updateReturningMock,
  deleteWhereMock,
  revokeAllGrantsMock,
} = vi.hoisted(() => ({
  selectQueue: [] as unknown[][],
  insertValuesReturningMock: vi.fn(),
  insertValuesMock: vi.fn(),
  updateSetMock: vi.fn(),
  updateReturningMock: vi.fn(),
  deleteWhereMock: vi.fn(),
  revokeAllGrantsMock: vi.fn(),
}));

vi.mock("lib/visibility", () => ({ revokeAllGrants: revokeAllGrantsMock }));

vi.mock("../db.pg", () => {
  const nextSelect = () => Promise.resolve(selectQueue.shift() ?? []);
  // select().from().where().limit() | .orderBy().limit() | await
  const selectChain = () => ({
    from: () => ({
      where: () => ({
        limit: () => nextSelect(),
        orderBy: () => ({ limit: () => nextSelect() }),
        then: (r: (v: unknown) => unknown) => nextSelect().then(r),
      }),
      innerJoin: () => ({
        where: () => ({
          orderBy: () => ({ limit: () => nextSelect() }),
        }),
      }),
    }),
  });
  const insert = () => ({
    values: (v: unknown) => {
      insertValuesMock(v);
      return { returning: () => insertValuesReturningMock() };
    },
  });
  const update = () => ({
    set: (v: unknown) => {
      updateSetMock(v);
      return { where: () => ({ returning: () => updateReturningMock() }) };
    },
  });
  const del = () => ({
    where: (...a: unknown[]) => {
      deleteWhereMock(...a);
      return Promise.resolve();
    },
  });
  return { pgDb: { select: selectChain, insert, update, delete: del } };
});

import { pgDocumentRepository as repo } from "./document-repository.pg";

const OWNER = "00000000-0000-0000-0000-0000000000aa";
const OTHER = "00000000-0000-0000-0000-0000000000bb";
const DOC = "00000000-0000-0000-0000-0000000000dd";

// Build the single row checkAccess's select returns.
function accessRow(
  overrides: Partial<{
    userId: string;
    visibility: string;
    teamId: string | null;
    isAdmin: boolean;
    hasGrant: boolean;
    hasEditGrant: boolean;
  }>,
) {
  return {
    userId: OWNER,
    visibility: "private",
    teamId: null,
    isAdmin: false,
    hasGrant: false,
    hasEditGrant: false,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  selectQueue.length = 0;
});

describe("checkAccess matrix", () => {
  it("owner always has read AND manage", async () => {
    selectQueue.push([accessRow({ userId: OWNER })]);
    expect(await repo.checkAccess(DOC, OWNER, true)).toBe(true);
    selectQueue.push([accessRow({ userId: OWNER })]);
    expect(await repo.checkAccess(DOC, OWNER, false)).toBe(true);
  });

  it("org admin always has read AND manage", async () => {
    selectQueue.push([accessRow({ userId: OWNER, isAdmin: true })]);
    expect(await repo.checkAccess(DOC, OTHER, true)).toBe(true);
    selectQueue.push([accessRow({ userId: OWNER, isAdmin: true })]);
    expect(await repo.checkAccess(DOC, OTHER, false)).toBe(true);
  });

  it("private: a cross-user caller is DENIED read and manage", async () => {
    selectQueue.push([accessRow({ visibility: "private" })]);
    expect(await repo.checkAccess(DOC, OTHER, true)).toBe(false);
    selectQueue.push([accessRow({ visibility: "private" })]);
    expect(await repo.checkAccess(DOC, OTHER, false)).toBe(false);
  });

  it("company: any caller may read but not manage", async () => {
    selectQueue.push([accessRow({ visibility: "company" })]);
    expect(await repo.checkAccess(DOC, OTHER, true)).toBe(true);
    selectQueue.push([accessRow({ visibility: "company" })]);
    expect(await repo.checkAccess(DOC, OTHER, false)).toBe(false);
  });

  it("team: a member may read, a non-member may not", async () => {
    // checkAccess does a 2nd select against asafe_team_member for a "team" doc.
    selectQueue.push([accessRow({ visibility: "team", teamId: "team-1" })]);
    selectQueue.push([{ ok: true }]); // membership found
    expect(await repo.checkAccess(DOC, OTHER, true)).toBe(true);

    selectQueue.push([accessRow({ visibility: "team", teamId: "team-1" })]);
    selectQueue.push([]); // no membership
    expect(await repo.checkAccess(DOC, OTHER, true)).toBe(false);
  });

  it("shared: a view grant gives read but NOT manage", async () => {
    selectQueue.push([
      accessRow({ visibility: "shared", hasGrant: true, hasEditGrant: false }),
    ]);
    expect(await repo.checkAccess(DOC, OTHER, true)).toBe(true);
    selectQueue.push([
      accessRow({ visibility: "shared", hasGrant: true, hasEditGrant: false }),
    ]);
    expect(await repo.checkAccess(DOC, OTHER, false)).toBe(false);
  });

  it("shared: an edit grant gives manage", async () => {
    selectQueue.push([
      accessRow({ visibility: "shared", hasGrant: true, hasEditGrant: true }),
    ]);
    expect(await repo.checkAccess(DOC, OTHER, false)).toBe(true);
  });

  it("missing document → false", async () => {
    selectQueue.push([]);
    expect(await repo.checkAccess(DOC, OTHER, true)).toBe(false);
  });
});

describe("setVisibility revokes grants when going private", () => {
  it("calls revokeAllGrants('document', id) on visibility='private'", async () => {
    // checkAccess(manage) → owner row, then update returns the row.
    selectQueue.push([accessRow({ userId: OWNER })]);
    updateReturningMock.mockReturnValue([{ id: DOC, visibility: "private" }]);
    await repo.setVisibility(DOC, "private", OWNER);
    expect(revokeAllGrantsMock).toHaveBeenCalledWith("document", DOC);
  });

  it("does NOT revoke grants when going company", async () => {
    selectQueue.push([accessRow({ userId: OWNER })]);
    updateReturningMock.mockReturnValue([{ id: DOC, visibility: "company" }]);
    await repo.setVisibility(DOC, "company", OWNER);
    expect(revokeAllGrantsMock).not.toHaveBeenCalled();
  });

  it("denies a non-owner without edit grant", async () => {
    selectQueue.push([accessRow({ visibility: "private" })]);
    await expect(repo.setVisibility(DOC, "company", OTHER)).rejects.toThrow(
      "Forbidden",
    );
    expect(updateSetMock).not.toHaveBeenCalled();
  });
});

describe("updateDocument", () => {
  it("bumps lastEditedBy/At and forwards title+content for an owner", async () => {
    selectQueue.push([accessRow({ userId: OWNER })]); // checkAccess(manage)
    updateReturningMock.mockReturnValue([{ id: DOC }]);
    await repo.updateDocument(DOC, { title: "T", content: { a: 1 } }, OWNER);
    const set = updateSetMock.mock.calls[0][0] as Record<string, unknown>;
    expect(set.lastEditedBy).toBe(OWNER);
    expect(set.lastEditedAt).toBeInstanceOf(Date);
    expect(set.title).toBe("T");
    expect(set.content).toEqual({ a: 1 });
  });

  it("rejects a caller without edit access", async () => {
    selectQueue.push([accessRow({ visibility: "company" })]); // read-only
    await expect(
      repo.updateDocument(DOC, { title: "x" }, OTHER),
    ).rejects.toThrow("Forbidden");
    expect(updateSetMock).not.toHaveBeenCalled();
  });
});

describe("createDocument", () => {
  it("defaults title to 'Untitled' and visibility to private", async () => {
    insertValuesReturningMock.mockReturnValue([{ id: DOC }]);
    await repo.createDocument({ userId: OWNER });
    const v = insertValuesMock.mock.calls[0][0] as Record<string, unknown>;
    expect(v.title).toBe("Untitled");
    expect(v.visibility).toBe("private");
    expect(v.userId).toBe(OWNER);
  });
});
