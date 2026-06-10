/**
 * Shared write-path helpers for knowledge collections (Wave 6 phase 2).
 * Visibility levels follow the unified model (docs/design/visibility-model.md);
 * the legacy "org" value is still accepted on input and normalized to
 * "company" on write (the resolver also reads stored "org" rows as company).
 */

export type KnowledgeWriteVisibility =
  | "private"
  | "shared"
  | "team"
  | "company";

export const WRITABLE_VISIBILITIES: ReadonlySet<string> = new Set([
  "private",
  "shared",
  "team",
  "company",
  "org",
]);

export function normalizeWriteVisibility(
  visibility: string,
): KnowledgeWriteVisibility {
  return (
    visibility === "org" ? "company" : visibility
  ) as KnowledgeWriteVisibility;
}

/**
 * Resolve the modern teamIds[] from a write request, keeping the legacy
 * single teamId as a fallback input. Callers must keep the legacy column
 * synced to teamIds[0].
 */
export function resolveTeamIds(input: {
  teamIds?: string[] | null;
  teamId?: string | null;
}): string[] | null {
  if (Array.isArray(input.teamIds) && input.teamIds.length > 0) {
    return input.teamIds;
  }
  return input.teamId ? [input.teamId] : null;
}
