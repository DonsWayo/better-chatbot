import { ChatExportCommentWithUser } from "app-types/chat-export";

/**
 * Pure, framework-agnostic helpers backing the realtime-via-polling comments
 * drawer (src/components/export/comments.tsx). Kept out of the component so the
 * live-merge behaviour is unit-testable without a DOM — the drawer renders
 * directly from whatever tree these return.
 *
 * Realtime here is POLLING, not a held-open connection: the export page is
 * PUBLIC, so the authenticated Electric shape proxy cannot serve anonymous
 * viewers, and an SWR `refreshInterval` is network-idle-safe (the network goes
 * quiet between polls). See content/docs/collaboration/realtime.mdx#comments.
 */

/**
 * Total comments in a nested tree, counting every reply at every depth. Used
 * for the trigger's count badge so it tracks live data (top-level + replies).
 */
export function countComments(
  comments: ChatExportCommentWithUser[] | undefined,
): number {
  if (!comments?.length) return 0;
  return comments.reduce(
    (acc, comment) => acc + 1 + countComments(comment.replies),
    0,
  );
}

/**
 * Collect every comment id present anywhere in a nested tree (top-level +
 * replies, recursively). Used to detect which optimistic inserts the server
 * already knows about so we can drop them once they land.
 */
function collectIds(
  comments: ChatExportCommentWithUser[] | undefined,
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
 * Rules:
 *  - Server data is the source of truth: other users' new comments and replies
 *    appear, and comments deleted by anyone disappear (they are simply absent
 *    from the next poll).
 *  - An optimistic comment is kept ONLY while the server has not yet seen it
 *    (its id is absent from the server tree). Once the server returns it, the
 *    server copy wins (real id/timestamp/author).
 *  - Optimistic top-level comments are appended after server comments (newest
 *    last, matching createdAt ordering). Optimistic replies are appended under
 *    their still-present parent; if the parent vanished server-side, the orphan
 *    reply is dropped.
 *
 * This function never mutates its inputs.
 */
export function mergeComments(
  server: ChatExportCommentWithUser[] | undefined,
  optimistic: ChatExportCommentWithUser[] | undefined,
): ChatExportCommentWithUser[] {
  const serverList = server ?? [];
  if (!optimistic?.length) return serverList;

  const serverIds = collectIds(serverList);

  // Partition pending optimistic comments into top-level vs replies the server
  // has not yet acknowledged.
  const pendingTopLevel: ChatExportCommentWithUser[] = [];
  const pendingRepliesByParent = new Map<string, ChatExportCommentWithUser[]>();

  const walk = (nodes: ChatExportCommentWithUser[]) => {
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

  // Graft pending replies onto their (still-present) server parents.
  const graftReplies = (
    node: ChatExportCommentWithUser,
  ): ChatExportCommentWithUser => {
    const ownPending = pendingRepliesByParent.get(node.id) ?? [];
    const children = (node.replies ?? []).map(graftReplies);
    const merged = [...children, ...ownPending];
    if (merged.length === 0) return node;
    return { ...node, replies: merged };
  };

  return [...serverList.map(graftReplies), ...pendingTopLevel];
}
