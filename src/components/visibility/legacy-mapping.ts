/**
 * Pure mapping between the modern four-level visibility and the legacy
 * `visibility` enum still stored on workflow/agent rows. Kept dependency-free
 * (no React, no server-only) so it is unit-testable and importable from both
 * client components and server routes.
 *
 * See docs/collaboration/visibility.mdx ("UI ↔ legacy-column mapping"): the
 * real access signal for `team`/`shared` lives in `teamIds[]` + the
 * `entity_grant` table (which the resolver prefers); the legacy column only
 * needs to keep org-wide ("company") reads working through the resolver's
 * legacy path. A future migration that widens the enum makes this a no-op.
 */

/** The four-level visibility, mirrored locally to avoid a server-only import. */
export type FourLevelVisibility = "private" | "shared" | "team" | "company";

/** Legacy enum still stored on workflow/agent rows. */
export type LegacyVisibilityColumn = "public" | "private" | "readonly";

/**
 * Map a four-level visibility onto the legacy column value. Only `company`
 * writes `public` (the value the resolver's legacy path reads as org-wide);
 * every other level writes `private` and relies on `teamIds` + grants.
 */
export function toLegacyVisibilityColumn(
  visibility: FourLevelVisibility,
): LegacyVisibilityColumn {
  return visibility === "company" ? "public" : "private";
}

/**
 * Inverse used to seed the picker from a row that only has the legacy column +
 * teamIds. `public` → company; legacy `private` with a non-empty `teamIds` →
 * team; otherwise private. `shared` is detected separately by the presence of
 * grants (not inferable from the row), so it is never returned here — the
 * picker opens at the inferred base level and the grant list does the rest.
 */
export function fromLegacyVisibilityColumn(
  legacy: string | null | undefined,
  teamIds: string[] | null | undefined,
): FourLevelVisibility {
  if (legacy === "public") return "company";
  if ((teamIds?.length ?? 0) > 0) return "team";
  return "private";
}
