"use server";

import { getSession } from "auth/server";
import {
  type AgentRevisionEntity,
  type RevisionKind,
  approveRevision,
  createDraftRevision,
  getRevision,
  getSourceOwnerId,
  listRevisions,
  rejectRevision,
  submitForReview,
} from "lib/agent-platform/revisions";

// Agent Platform #19 — publish lifecycle Server Actions.
// Internal-UI mutations → Server Actions only (docs/CLAUDE.md rule); all the
// transition logic lives in lib/agent-platform/revisions.ts. These wrappers
// only do auth + ownership gating:
//   - draft/submit: source owner (author) or global admin
//   - approve/reject (review decisions): global admin only; orgWide is
//     additionally re-enforced inside the lib
//   - list: source owner or admin (snapshots can contain private config)

type AuthedUser = { id: string; isAdmin: boolean };

async function requireUser(): Promise<AuthedUser> {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  return { id: session.user.id, isAdmin: session.user.role === "admin" };
}

/** Owner-or-admin gate against the LIVE agent/workflow row. */
async function requireSourceOwnership(
  user: AuthedUser,
  kind: RevisionKind,
  sourceId: string,
): Promise<void> {
  if (user.isAdmin) return;
  const ownerId = await getSourceOwnerId(kind, sourceId);
  if (!ownerId || ownerId !== user.id) {
    throw new Error("Forbidden: not the owner of this agent/workflow");
  }
}

export async function createDraftRevisionAction(input: {
  kind: RevisionKind;
  sourceId: string;
  changelog?: string;
}): Promise<AgentRevisionEntity> {
  const user = await requireUser();
  await requireSourceOwnership(user, input.kind, input.sourceId);
  return createDraftRevision({
    kind: input.kind,
    sourceId: input.sourceId,
    authorId: user.id,
    changelog: input.changelog,
  });
}

export async function submitForReviewAction(
  revisionId: string,
): Promise<AgentRevisionEntity> {
  const user = await requireUser();
  // Author-or-admin is enforced inside the lib transition itself.
  return submitForReview(revisionId, user.id, { isAdmin: user.isAdmin });
}

export async function approveRevisionAction(
  revisionId: string,
  opts?: { teamIds?: string[] | null; orgWide?: boolean },
): Promise<AgentRevisionEntity> {
  const user = await requireUser();
  if (!user.isAdmin) {
    throw new Error("Forbidden: only admins can approve revisions");
  }
  return approveRevision(revisionId, {
    approvedBy: user.id,
    teamIds: opts?.teamIds,
    orgWide: opts?.orgWide,
    isAdmin: user.isAdmin,
  });
}

export async function rejectRevisionAction(
  revisionId: string,
  reason: string,
): Promise<AgentRevisionEntity> {
  const user = await requireUser();
  if (!user.isAdmin) {
    const revision = await getRevision(revisionId);
    if (!revision) throw new Error("Revision not found");
    // Authors may withdraw their own pending revision; everyone else needs
    // the admin reviewer role.
    if (revision.authorId !== user.id) {
      throw new Error("Forbidden: only admins or the author can reject");
    }
  }
  return rejectRevision(revisionId, reason);
}

export async function listRevisionsAction(
  kind: RevisionKind,
  sourceId: string,
): Promise<AgentRevisionEntity[]> {
  const user = await requireUser();
  await requireSourceOwnership(user, kind, sourceId);
  return listRevisions(kind, sourceId);
}
