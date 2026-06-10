import type { Visibility } from "lib/visibility";

/**
 * Client-side shapes for the knowledge Studio UI. These mirror what the REST
 * endpoints return (`/api/knowledge/collections` and the documents subroute) —
 * dates arrive as ISO strings over JSON.
 */

export interface KnowledgeCollectionSummary {
  id: string;
  name: string;
  description: string | null;
  /** Raw stored value — may still hold the legacy "org" level. */
  visibility: string | null;
  teamIds: string[] | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeDocumentSummary {
  /** base64url(sourceRef) — the documents DELETE endpoint id. */
  id: string;
  sourceRef: string;
  chunkCount: number;
  createdAt: string;
}

/**
 * Normalize a stored visibility value to the unified four-level model for
 * display/editing. Legacy "org" (and workflow-style "public") read as
 * company; anything unknown degrades safely to private — same direction the
 * server-side resolver takes.
 */
export function normalizeCollectionVisibility(
  visibility: string | null | undefined,
): Visibility {
  switch (visibility) {
    case "company":
    case "org":
    case "public":
      return "company";
    case "team":
      return "team";
    case "shared":
      return "shared";
    default:
      return "private";
  }
}
