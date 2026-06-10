/**
 * Pure mapping between the modern four-level visibility and the `visibility`
 * column stored on workflow/agent rows. Kept dependency-free (no React, no
 * server-only) so it is unit-testable and importable from both client
 * components and server routes.
 *
 * Since migration `0041_visibility_enum_widening` the column stores the
 * LITERAL four-level value ("private" | "shared" | "team" | "company"), so
 * `toLegacyVisibilityColumn` is now an identity — it is kept so call sites
 * don't churn. Legacy values ("public" | "readonly") remain readable:
 * `fromLegacyVisibilityColumn` maps them exactly like before the widening.
 * See docs/collaboration/visibility.mdx ("Stored value ↔ picker mapping").
 */

/** The four-level visibility, mirrored locally to avoid a server-only import. */
export type FourLevelVisibility = "private" | "shared" | "team" | "company";

/** Legacy enum values that may still be stored on unmigrated/readonly rows. */
export type LegacyVisibilityColumn = "public" | "private" | "readonly";

/** Everything the widened column can hold (modern levels + legacy leftovers). */
export type StoredVisibilityColumn =
  | FourLevelVisibility
  | LegacyVisibilityColumn;

/**
 * Persist a four-level visibility to the column. Identity since migration
 * 0041 widened the enum — the literal level is stored. (Before 0041 only
 * `company` wrote `public` and everything else wrote `private`.)
 */
export function toLegacyVisibilityColumn(
  visibility: FourLevelVisibility,
): StoredVisibilityColumn {
  return visibility;
}

/**
 * Seed the picker from a stored row. Modern values pass through literally
 * (`company`/`team`/`shared`); legacy `public` → company; any remaining row
 * with a non-empty `teamIds` → team (pre-0041 "team" was stored as legacy
 * `private` + teamIds); everything else — including legacy `readonly`,
 * unknown and null — fails closed to private. `shared` is only returned when
 * literally stored; for legacy rows it is detected by the presence of grants,
 * so the picker opens at the inferred base level and the grant list does the
 * rest.
 */
export function fromLegacyVisibilityColumn(
  stored: string | null | undefined,
  teamIds: string[] | null | undefined,
): FourLevelVisibility {
  if (stored === "company" || stored === "public") return "company";
  if (stored === "shared") return "shared";
  if (stored === "team") return "team";
  if ((teamIds?.length ?? 0) > 0) return "team";
  return "private";
}
