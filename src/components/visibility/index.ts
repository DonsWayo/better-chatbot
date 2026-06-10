/**
 * Reusable visibility UI — the single source other entities adopt later.
 *
 * `VisibilityPicker` is the four-level control (private → shared → team →
 * company) defined in docs/design/visibility-model.md. It emits a
 * `VisibilityValue` ({ visibility, teamIds }) and manages "shared" grants
 * directly through the visibility server actions.
 *
 * `toLegacyVisibilityColumn` maps the modern four-level value onto the legacy
 * "public" | "private" | "readonly" enum that the workflow/agent rows still
 * store, until a future migration widens that column. See the note in
 * docs/collaboration/visibility.mdx — only "company" writes "public"; every
 * other level writes "private" and relies on `teamIds` + the `entity_grant`
 * table (which the resolver already prefers) for access.
 */
export {
  VisibilityPicker,
  type TeamOption,
  type VisibilityPickerEntityType,
  type VisibilityValue,
} from "./visibility-picker";
export { VisibilityField } from "./visibility-field";
export {
  type FourLevelVisibility,
  type LegacyVisibilityColumn,
  fromLegacyVisibilityColumn,
  toLegacyVisibilityColumn,
} from "./legacy-mapping";
