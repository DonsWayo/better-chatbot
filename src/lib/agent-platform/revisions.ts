import "server-only";

import { and, desc, eq } from "drizzle-orm";
import { pgDb as db } from "lib/db/pg/db.pg";
import {
  type AgentRevisionEntity,
  AgentRevisionTable,
  AgentTable,
  WorkflowTable,
} from "lib/db/pg/schema.pg";
import { workflowRepository } from "lib/db/repository";

// Agent Platform #19 — immutable revisions + publish lifecycle
// (docs/design/agent-platform.md: Definition → Revision → Session).
//
// Editing flows keep mutating the LIVE agent/workflow tables exactly as
// today. A draft revision is a point-in-time snapshot taken when the author
// decides to submit their current state for review — it is NOT a working
// copy. Once published, a revision is immutable: sessions pin its id and
// execute from its configSnapshot, so publishing v(n+1) never mutates an
// in-flight v(n) run. Callers without a published revision fall back to the
// live definition (resolveRunnableRevision returns null), which keeps every
// existing surface backward compatible.
//
// Lifecycle: draft → pending_review → published → archived
//   - submitForReview: author (or admin) moves draft → pending_review
//   - approveRevision: pending_review → published; the previously published
//     revision of the same (kind, sourceId) is archived in the same
//     transaction, preserving "at most one published per source".
//   - rejectRevision: pending_review → draft, changelog gains "Rejected: …"

export type { AgentRevisionEntity };

export type RevisionKind = "conversational" | "workflow";
export type RevisionStatus =
  | "draft"
  | "pending_review"
  | "published"
  | "archived";

/** Frozen workflow definition: the workflow row plus its full graph. */
export interface WorkflowConfigSnapshot {
  workflow: Record<string, unknown>;
  nodes: unknown[];
  edges: unknown[];
}

export interface CreateDraftRevisionInput {
  kind: RevisionKind;
  sourceId: string;
  authorId: string;
  changelog?: string;
}

export interface ApproveRevisionInput {
  approvedBy: string;
  /** Multi-team visibility (MCP catalog pattern); omitted = personal. */
  teamIds?: string[] | null;
  /** Org-wide publish — requires isAdmin (enforced here too). */
  orgWide?: boolean;
  /** Role gate is the action layer's job; the lib only guards orgWide. */
  isAdmin?: boolean;
}

/**
 * Load the full current workflow definition (row + nodes + edges) via the
 * existing repository and shape it as a configSnapshot.
 */
export async function snapshotWorkflow(
  workflowId: string,
): Promise<WorkflowConfigSnapshot> {
  const structure = await workflowRepository.selectStructureById(workflowId);
  if (!structure) throw new Error("Workflow not found");
  const { nodes, edges, ...workflow } = structure;
  return {
    workflow: workflow as unknown as Record<string, unknown>,
    nodes,
    edges,
  };
}

/**
 * Load the full current agent row as a configSnapshot. Queried directly
 * (not via agentRepository.selectAgentById) because the repository select is
 * visibility-filtered per viewer, while a snapshot needs the raw definition.
 */
export async function snapshotAgent(
  agentId: string,
): Promise<Record<string, unknown>> {
  const [agent] = await db
    .select()
    .from(AgentTable)
    .where(eq(AgentTable.id, agentId))
    .limit(1);
  if (!agent) throw new Error("Agent not found");
  return agent as unknown as Record<string, unknown>;
}

/** Owner (userId) of the live agent/workflow row, or null if it is gone. */
export async function getSourceOwnerId(
  kind: RevisionKind,
  sourceId: string,
): Promise<string | null> {
  if (kind === "workflow") {
    const [row] = await db
      .select({ userId: WorkflowTable.userId })
      .from(WorkflowTable)
      .where(eq(WorkflowTable.id, sourceId))
      .limit(1);
    return row?.userId ?? null;
  }
  const [row] = await db
    .select({ userId: AgentTable.userId })
    .from(AgentTable)
    .where(eq(AgentTable.id, sourceId))
    .limit(1);
  return row?.userId ?? null;
}

/**
 * Snapshot the CURRENT live definition into a new draft revision with
 * version = max(version) + 1 for this (kind, sourceId).
 */
export async function createDraftRevision(
  input: CreateDraftRevisionInput,
): Promise<AgentRevisionEntity> {
  const configSnapshot =
    input.kind === "workflow"
      ? await snapshotWorkflow(input.sourceId)
      : await snapshotAgent(input.sourceId);

  const [latest] = await db
    .select({ version: AgentRevisionTable.version })
    .from(AgentRevisionTable)
    .where(
      and(
        eq(AgentRevisionTable.kind, input.kind),
        eq(AgentRevisionTable.sourceId, input.sourceId),
      ),
    )
    .orderBy(desc(AgentRevisionTable.version))
    .limit(1);
  const version = (latest?.version ?? 0) + 1;

  const [revision] = await db
    .insert(AgentRevisionTable)
    .values({
      kind: input.kind,
      sourceId: input.sourceId,
      version,
      configSnapshot,
      status: "draft",
      authorId: input.authorId,
      changelog: input.changelog ?? null,
    })
    .returning();
  return revision;
}

/** draft → pending_review. Author or admin only. */
export async function submitForReview(
  revisionId: string,
  userId: string,
  opts?: { isAdmin?: boolean },
): Promise<AgentRevisionEntity> {
  const revision = await getRevision(revisionId);
  if (!revision) throw new Error("Revision not found");
  if (revision.status !== "draft")
    throw new Error(`Only draft revisions can be submitted for review`);
  if (revision.authorId !== userId && !opts?.isAdmin)
    throw new Error("Forbidden: only the author or an admin can submit");

  const [updated] = await db
    .update(AgentRevisionTable)
    .set({ status: "pending_review", updatedAt: new Date() })
    .where(eq(AgentRevisionTable.id, revisionId))
    .returning();
  return updated;
}

/**
 * pending_review → published. Archives the previously published revision of
 * the same (kind, sourceId) in the same transaction so at most one revision
 * per source is ever published. orgWide publishing requires isAdmin.
 */
export async function approveRevision(
  revisionId: string,
  input: ApproveRevisionInput,
): Promise<AgentRevisionEntity> {
  const revision = await getRevision(revisionId);
  if (!revision) throw new Error("Revision not found");
  if (revision.status !== "pending_review")
    throw new Error("Only pending_review revisions can be approved");
  if (input.orgWide && !input.isAdmin)
    throw new Error("Forbidden: org-wide publish requires admin");

  const now = new Date();
  const teamIds =
    input.teamIds && input.teamIds.length > 0
      ? input.teamIds.filter(Boolean)
      : null;

  return db.transaction(async (tx) => {
    // Archive whichever revision of this source is currently published.
    await tx
      .update(AgentRevisionTable)
      .set({ status: "archived", updatedAt: now })
      .where(
        and(
          eq(AgentRevisionTable.kind, revision.kind),
          eq(AgentRevisionTable.sourceId, revision.sourceId),
          eq(AgentRevisionTable.status, "published"),
        ),
      );

    const [published] = await tx
      .update(AgentRevisionTable)
      .set({
        status: "published",
        approvedBy: input.approvedBy,
        teamIds,
        orgWide: input.orgWide ?? false,
        updatedAt: now,
      })
      .where(eq(AgentRevisionTable.id, revisionId))
      .returning();
    return published;
  });
}

/** pending_review → draft, with "Rejected: <reason>" appended to changelog. */
export async function rejectRevision(
  revisionId: string,
  reason: string,
): Promise<AgentRevisionEntity> {
  const revision = await getRevision(revisionId);
  if (!revision) throw new Error("Revision not found");
  if (revision.status !== "pending_review")
    throw new Error("Only pending_review revisions can be rejected");

  const note = `Rejected: ${reason}`;
  const changelog = revision.changelog
    ? `${revision.changelog}\n${note}`
    : note;
  const [updated] = await db
    .update(AgentRevisionTable)
    .set({ status: "draft", changelog, updatedAt: new Date() })
    .where(eq(AgentRevisionTable.id, revisionId))
    .returning();
  return updated;
}

/** The single published revision for this source, or null. */
export async function getPublishedRevision(
  kind: RevisionKind,
  sourceId: string,
): Promise<AgentRevisionEntity | null> {
  const [revision] = await db
    .select()
    .from(AgentRevisionTable)
    .where(
      and(
        eq(AgentRevisionTable.kind, kind),
        eq(AgentRevisionTable.sourceId, sourceId),
        eq(AgentRevisionTable.status, "published"),
      ),
    )
    .limit(1);
  return revision ?? null;
}

/** All revisions of a source, newest version first. */
export async function listRevisions(
  kind: RevisionKind,
  sourceId: string,
): Promise<AgentRevisionEntity[]> {
  return db
    .select()
    .from(AgentRevisionTable)
    .where(
      and(
        eq(AgentRevisionTable.kind, kind),
        eq(AgentRevisionTable.sourceId, sourceId),
      ),
    )
    .orderBy(desc(AgentRevisionTable.version));
}

export async function getRevision(
  id: string,
): Promise<AgentRevisionEntity | null> {
  const [revision] = await db
    .select()
    .from(AgentRevisionTable)
    .where(eq(AgentRevisionTable.id, id))
    .limit(1);
  return revision ?? null;
}

/**
 * The revision an execution should pin: the published one, or null when the
 * source has never been published — callers then fall back to the live
 * definition, keeping pre-revision behavior fully backward compatible.
 */
export async function resolveRunnableRevision(
  kind: RevisionKind,
  sourceId: string,
): Promise<AgentRevisionEntity | null> {
  return getPublishedRevision(kind, sourceId);
}
