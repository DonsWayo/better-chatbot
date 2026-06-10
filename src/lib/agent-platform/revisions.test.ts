import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Drizzle mock chain ────────────────────────────────────────────────────────
// Mirrors model-policy.test.ts: the db module is fully mocked. Each
// db.select() consumes the next row-array from state.selectResults (FIFO), so
// tests script every read in call order. Inserts capture their values and
// echo them back from .returning(); updates record every .set() payload (in
// order) so the approve path can assert archive-then-publish, and
// db.transaction simply invokes its callback with the same mocked handle.

const h = vi.hoisted(() => {
  const state = {
    selectResults: [] as unknown[][],
    insertedValues: [] as Record<string, unknown>[],
    updateSetCalls: [] as Record<string, unknown>[],
    updateReturning: [] as unknown[][],
    structure: null as unknown,
  };

  const makeSelectChain = (): unknown => {
    const rows = Promise.resolve(state.selectResults.shift() ?? []);
    const chain = {
      from: () => chain,
      where: () => chain,
      orderBy: () => chain,
      limit: () => rows,
      then: (
        onFulfilled?: (r: unknown[]) => unknown,
        onRejected?: (e: unknown) => unknown,
      ) => rows.then(onFulfilled, onRejected),
    };
    return chain;
  };
  const selectMock = vi.fn(() => makeSelectChain());

  const insertMock = vi.fn(() => ({
    values: (values: Record<string, unknown>) => {
      state.insertedValues.push(values);
      return {
        returning: () =>
          Promise.resolve([
            { id: `rev-${state.insertedValues.length}`, ...values },
          ]),
      };
    },
  }));

  const updateMock = vi.fn(() => ({
    set: (set: Record<string, unknown>) => {
      state.updateSetCalls.push(set);
      const result = Promise.resolve(
        state.updateReturning.shift() ?? [{ id: "updated", ...set }],
      );
      const afterWhere = {
        returning: () => result,
        then: (
          onFulfilled?: (r: unknown) => unknown,
          onRejected?: (e: unknown) => unknown,
        ) => result.then(onFulfilled, onRejected),
      };
      return { where: () => afterWhere };
    },
  }));

  const transactionMock = vi.fn(async (cb: (tx: unknown) => Promise<unknown>) =>
    cb({ select: selectMock, insert: insertMock, update: updateMock }),
  );

  const selectStructureByIdMock = vi.fn(() => Promise.resolve(state.structure));

  return {
    state,
    selectMock,
    insertMock,
    updateMock,
    transactionMock,
    selectStructureByIdMock,
  };
});

const {
  state,
  insertMock,
  updateMock,
  transactionMock,
  selectStructureByIdMock,
} = h;

vi.mock("lib/db/pg/db.pg", () => ({
  pgDb: {
    select: h.selectMock,
    insert: h.insertMock,
    update: h.updateMock,
    transaction: h.transactionMock,
  },
}));

vi.mock("lib/db/repository", () => ({
  workflowRepository: { selectStructureById: h.selectStructureByIdMock },
}));

vi.mock("lib/db/pg/schema.pg", () => ({
  AgentRevisionTable: {
    id: "id",
    kind: "kind",
    sourceId: "sourceId",
    version: "version",
    status: "status",
  },
  AgentTable: { id: "id", userId: "userId" },
  WorkflowTable: { id: "id", userId: "userId" },
}));

vi.mock("drizzle-orm", () => ({
  and: vi.fn((...args: unknown[]) => ({ and: args })),
  eq: vi.fn((_a: unknown, _b: unknown) => ({})),
  desc: vi.fn((c: unknown) => c),
}));

import {
  approveRevision,
  createDraftRevision,
  getPublishedRevision,
  getRevision,
  getSourceOwnerId,
  listRevisions,
  rejectRevision,
  resolveRunnableRevision,
  snapshotAgent,
  snapshotWorkflow,
  submitForReview,
} from "./revisions";

beforeEach(() => {
  vi.clearAllMocks();
  state.selectResults = [];
  state.insertedValues = [];
  state.updateSetCalls = [];
  state.updateReturning = [];
  state.structure = null;
});

// ── snapshots ────────────────────────────────────────────────────────────────

describe("snapshotWorkflow", () => {
  it("freezes the workflow row plus its full nodes and edges", async () => {
    state.structure = {
      id: "wf-1",
      name: "My Flow",
      nodes: [{ id: "n1" }, { id: "n2" }],
      edges: [{ id: "e1" }],
    };
    const snap = await snapshotWorkflow("wf-1");
    expect(snap.nodes).toEqual([{ id: "n1" }, { id: "n2" }]);
    expect(snap.edges).toEqual([{ id: "e1" }]);
    expect(snap.workflow).toEqual({ id: "wf-1", name: "My Flow" });
  });

  it("does not duplicate nodes/edges inside the workflow row", async () => {
    state.structure = { id: "wf-1", nodes: [], edges: [] };
    const snap = await snapshotWorkflow("wf-1");
    expect(snap.workflow).not.toHaveProperty("nodes");
    expect(snap.workflow).not.toHaveProperty("edges");
  });

  it("throws when the workflow does not exist", async () => {
    state.structure = null;
    await expect(snapshotWorkflow("missing")).rejects.toThrow(
      "Workflow not found",
    );
  });
});

describe("snapshotAgent", () => {
  it("returns the full raw agent row", async () => {
    state.selectResults = [
      [{ id: "ag-1", name: "Helper", instructions: { p: "x" } }],
    ];
    await expect(snapshotAgent("ag-1")).resolves.toEqual({
      id: "ag-1",
      name: "Helper",
      instructions: { p: "x" },
    });
  });

  it("throws when the agent does not exist", async () => {
    state.selectResults = [[]];
    await expect(snapshotAgent("missing")).rejects.toThrow("Agent not found");
  });
});

// ── createDraftRevision ──────────────────────────────────────────────────────

describe("createDraftRevision", () => {
  it("first revision of a source gets version 1", async () => {
    state.structure = { id: "wf-1", nodes: [], edges: [] };
    state.selectResults = [[]]; // no prior revisions
    const rev = await createDraftRevision({
      kind: "workflow",
      sourceId: "wf-1",
      authorId: "u1",
    });
    expect(rev.version).toBe(1);
    expect(rev.status).toBe("draft");
  });

  it("increments version per (kind, sourceId): max 4 → 5", async () => {
    state.structure = { id: "wf-1", nodes: [], edges: [] };
    state.selectResults = [[{ version: 4 }]];
    const rev = await createDraftRevision({
      kind: "workflow",
      sourceId: "wf-1",
      authorId: "u1",
    });
    expect(rev.version).toBe(5);
  });

  it("inserts authorId and changelog on the draft row", async () => {
    state.structure = { id: "wf-1", nodes: [], edges: [] };
    state.selectResults = [[]];
    await createDraftRevision({
      kind: "workflow",
      sourceId: "wf-1",
      authorId: "author-9",
      changelog: "initial cut",
    });
    expect(state.insertedValues[0]).toMatchObject({
      kind: "workflow",
      sourceId: "wf-1",
      authorId: "author-9",
      changelog: "initial cut",
      status: "draft",
    });
  });

  it("workflow drafts snapshot {workflow, nodes, edges} from the repository", async () => {
    state.structure = {
      id: "wf-1",
      name: "F",
      nodes: [{ id: "n1" }],
      edges: [{ id: "e1" }],
    };
    state.selectResults = [[]];
    await createDraftRevision({
      kind: "workflow",
      sourceId: "wf-1",
      authorId: "u1",
    });
    expect(selectStructureByIdMock).toHaveBeenCalledWith("wf-1");
    expect(state.insertedValues[0].configSnapshot).toEqual({
      workflow: { id: "wf-1", name: "F" },
      nodes: [{ id: "n1" }],
      edges: [{ id: "e1" }],
    });
  });

  it("conversational drafts snapshot the raw agent row", async () => {
    state.selectResults = [
      [{ id: "ag-1", name: "Helper" }], // agent row
      [], // no prior revisions
    ];
    await createDraftRevision({
      kind: "conversational",
      sourceId: "ag-1",
      authorId: "u1",
    });
    expect(selectStructureByIdMock).not.toHaveBeenCalled();
    expect(state.insertedValues[0].configSnapshot).toEqual({
      id: "ag-1",
      name: "Helper",
    });
  });

  it("snapshot failure (missing source) prevents any insert", async () => {
    state.structure = null;
    await expect(
      createDraftRevision({
        kind: "workflow",
        sourceId: "wf-x",
        authorId: "u1",
      }),
    ).rejects.toThrow("Workflow not found");
    expect(insertMock).not.toHaveBeenCalled();
  });
});

// ── submitForReview ──────────────────────────────────────────────────────────

describe("submitForReview", () => {
  it("author moves draft → pending_review", async () => {
    state.selectResults = [[{ id: "r1", status: "draft", authorId: "u1" }]];
    const updated = await submitForReview("r1", "u1");
    expect(updated.status).toBe("pending_review");
    expect(state.updateSetCalls[0]).toMatchObject({ status: "pending_review" });
  });

  it("a non-author non-admin is forbidden", async () => {
    state.selectResults = [[{ id: "r1", status: "draft", authorId: "u1" }]];
    await expect(submitForReview("r1", "intruder")).rejects.toThrow(
      /Forbidden/,
    );
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("an admin who is not the author may submit", async () => {
    state.selectResults = [[{ id: "r1", status: "draft", authorId: "u1" }]];
    const updated = await submitForReview("r1", "admin-2", { isAdmin: true });
    expect(updated.status).toBe("pending_review");
  });

  it("rejects non-draft revisions", async () => {
    state.selectResults = [[{ id: "r1", status: "published", authorId: "u1" }]];
    await expect(submitForReview("r1", "u1")).rejects.toThrow(
      /Only draft revisions/,
    );
  });

  it("throws when the revision does not exist", async () => {
    state.selectResults = [[]];
    await expect(submitForReview("nope", "u1")).rejects.toThrow(
      "Revision not found",
    );
  });
});

// ── approveRevision ──────────────────────────────────────────────────────────

const pendingRev = {
  id: "r2",
  kind: "workflow",
  sourceId: "wf-1",
  status: "pending_review",
  authorId: "u1",
};

describe("approveRevision", () => {
  it("publishes a pending_review revision with approvedBy and teamIds", async () => {
    state.selectResults = [[pendingRev]];
    const published = await approveRevision("r2", {
      approvedBy: "admin-1",
      teamIds: ["t1", "t2"],
    });
    expect(published.status).toBe("published");
    expect(published.approvedBy).toBe("admin-1");
    expect(published.teamIds).toEqual(["t1", "t2"]);
  });

  it("archives the previously published revision in the same transaction (both updates issued)", async () => {
    state.selectResults = [[pendingRev]];
    await approveRevision("r2", { approvedBy: "admin-1" });
    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(state.updateSetCalls).toHaveLength(2);
    expect(state.updateSetCalls[0]).toMatchObject({ status: "archived" });
    expect(state.updateSetCalls[1]).toMatchObject({
      status: "published",
      approvedBy: "admin-1",
    });
  });

  it("orgWide publish without isAdmin is forbidden and issues no updates", async () => {
    state.selectResults = [[pendingRev]];
    await expect(
      approveRevision("r2", { approvedBy: "u1", orgWide: true }),
    ).rejects.toThrow(/org-wide publish requires admin/);
    expect(updateMock).not.toHaveBeenCalled();
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("orgWide publish with isAdmin succeeds", async () => {
    state.selectResults = [[pendingRev]];
    const published = await approveRevision("r2", {
      approvedBy: "admin-1",
      orgWide: true,
      isAdmin: true,
    });
    expect(published.orgWide).toBe(true);
    expect(published.status).toBe("published");
  });

  it("only pending_review revisions can be approved", async () => {
    state.selectResults = [[{ ...pendingRev, status: "draft" }]];
    await expect(
      approveRevision("r2", { approvedBy: "admin-1", isAdmin: true }),
    ).rejects.toThrow(/Only pending_review/);
  });

  it("empty teamIds array is normalized to null (personal scope)", async () => {
    state.selectResults = [[pendingRev]];
    const published = await approveRevision("r2", {
      approvedBy: "admin-1",
      teamIds: [],
    });
    expect(published.teamIds).toBeNull();
  });

  it("throws when the revision does not exist", async () => {
    state.selectResults = [[]];
    await expect(
      approveRevision("ghost", { approvedBy: "admin-1" }),
    ).rejects.toThrow("Revision not found");
  });
});

// ── rejectRevision ───────────────────────────────────────────────────────────

describe("rejectRevision", () => {
  it("returns the revision to draft with 'Rejected: <reason>' appended", async () => {
    state.selectResults = [
      [{ id: "r3", status: "pending_review", changelog: "v2 changes" }],
    ];
    const updated = await rejectRevision("r3", "missing guardrails");
    expect(updated.status).toBe("draft");
    expect(updated.changelog).toBe("v2 changes\nRejected: missing guardrails");
  });

  it("with no prior changelog the changelog is just the rejection note", async () => {
    state.selectResults = [
      [{ id: "r3", status: "pending_review", changelog: null }],
    ];
    const updated = await rejectRevision("r3", "nope");
    expect(updated.changelog).toBe("Rejected: nope");
  });

  it("only pending_review revisions can be rejected", async () => {
    state.selectResults = [[{ id: "r3", status: "draft", changelog: null }]];
    await expect(rejectRevision("r3", "x")).rejects.toThrow(
      /Only pending_review/,
    );
  });
});

// ── reads + resolution ───────────────────────────────────────────────────────

describe("reads and resolveRunnableRevision", () => {
  it("getPublishedRevision returns the published row", async () => {
    state.selectResults = [[{ id: "r9", status: "published" }]];
    await expect(getPublishedRevision("workflow", "wf-1")).resolves.toEqual({
      id: "r9",
      status: "published",
    });
  });

  it("getPublishedRevision returns null when nothing is published", async () => {
    state.selectResults = [[]];
    await expect(getPublishedRevision("workflow", "wf-1")).resolves.toBeNull();
  });

  it("resolveRunnableRevision returns the published revision when one exists", async () => {
    state.selectResults = [[{ id: "r9", status: "published" }]];
    await expect(
      resolveRunnableRevision("workflow", "wf-1"),
    ).resolves.toMatchObject({ id: "r9" });
  });

  it("resolveRunnableRevision returns null so callers fall back to the live definition", async () => {
    state.selectResults = [[]];
    await expect(
      resolveRunnableRevision("conversational", "ag-1"),
    ).resolves.toBeNull();
  });

  it("listRevisions returns every revision of the source", async () => {
    state.selectResults = [
      [
        { id: "r2", version: 2 },
        { id: "r1", version: 1 },
      ],
    ];
    const all = await listRevisions("workflow", "wf-1");
    expect(all.map((r) => r.id)).toEqual(["r2", "r1"]);
  });

  it("getRevision returns null for unknown ids", async () => {
    state.selectResults = [[]];
    await expect(getRevision("ghost")).resolves.toBeNull();
  });
});

// ── getSourceOwnerId ─────────────────────────────────────────────────────────

describe("getSourceOwnerId", () => {
  it("returns the workflow owner's userId", async () => {
    state.selectResults = [[{ userId: "owner-w" }]];
    await expect(getSourceOwnerId("workflow", "wf-1")).resolves.toBe("owner-w");
  });

  it("returns the agent owner's userId", async () => {
    state.selectResults = [[{ userId: "owner-a" }]];
    await expect(getSourceOwnerId("conversational", "ag-1")).resolves.toBe(
      "owner-a",
    );
  });

  it("returns null when the source row is gone", async () => {
    state.selectResults = [[]];
    await expect(getSourceOwnerId("workflow", "missing")).resolves.toBeNull();
  });
});
