import type { DocumentCommentWithUser } from "lib/db/pg/repositories/document-comment-repository.pg";

/**
 * Pure helpers backing the document comments panel's realtime-via-POLLING merge.
 * Mirrors src/components/export/comments-merge.ts but typed to document
 * comments. Kept DOM-free so the live-merge behaviour is unit-testable.
 *
 * Realtime here is POLLING (a 4s SWR refresh while the panel is OPEN + the tab
 * is visible), NOT a held-open connection: the network goes quiet between polls
 * so Playwright `networkidle` still settles and a closed panel holds nothing.
 */

/** Total comments in a nested tree, counting every reply at every depth. */
export function countComments(
  comments: DocumentCommentWithUser[] | undefined,
): number {
  if (!comments?.length) return 0;
  return comments.reduce(
    (acc, comment) => acc + 1 + countComments(comment.replies),
    0,
  );
}

function collectIds(
  comments: DocumentCommentWithUser[] | undefined,
  into: Set<string> = new Set(),
): Set<string> {
  for (const comment of comments ?? []) {
    into.add(comment.id);
    collectIds(comment.replies, into);
  }
  return into;
}

/**
 * Merge the freshly-polled server tree with any local optimistic comments the
 * current user just posted, so a poll that fires *before* the user's own POST
 * round-trips never makes their comment flicker away.
 *
 *  - Server data is the source of truth: other users' new comments/replies
 *    appear and anyone's deletions disappear.
 *  - An optimistic comment is kept ONLY while the server has not yet seen it
 *    (its id absent from the server tree); once the server returns it the real
 *    copy wins.
 *  - Optimistic top-level comments append after server comments; optimistic
 *    replies graft under their still-present parent, else are dropped.
 *
 * Never mutates its inputs.
 */
export function mergeComments(
  server: DocumentCommentWithUser[] | undefined,
  optimistic: DocumentCommentWithUser[] | undefined,
): DocumentCommentWithUser[] {
  const serverList = server ?? [];
  if (!optimistic?.length) return serverList;

  const serverIds = collectIds(serverList);

  const pendingTopLevel: DocumentCommentWithUser[] = [];
  const pendingRepliesByParent = new Map<string, DocumentCommentWithUser[]>();

  const walk = (nodes: DocumentCommentWithUser[]) => {
    for (const node of nodes) {
      if (!serverIds.has(node.id)) {
        if (node.parentId) {
          const bucket = pendingRepliesByParent.get(node.parentId) ?? [];
          bucket.push(node);
          pendingRepliesByParent.set(node.parentId, bucket);
        } else {
          pendingTopLevel.push(node);
        }
      }
      if (node.replies?.length) walk(node.replies);
    }
  };
  walk(optimistic);

  if (pendingTopLevel.length === 0 && pendingRepliesByParent.size === 0) {
    return serverList;
  }

  const graftReplies = (
    node: DocumentCommentWithUser,
  ): DocumentCommentWithUser => {
    const ownPending = pendingRepliesByParent.get(node.id) ?? [];
    const children = (node.replies ?? []).map(graftReplies);
    const merged = [...children, ...ownPending];
    if (merged.length === 0) return node;
    return { ...node, replies: merged };
  };

  return [...serverList.map(graftReplies), ...pendingTopLevel];
}
