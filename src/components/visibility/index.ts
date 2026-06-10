/**
 * Reusable visibility UI — the single source other entities adopt later.
 *
 * `VisibilityPicker` is the four-level control (private → shared → team →
 * company) defined in docs/design/visibility-model.md. It emits a
 * `VisibilityValue` ({ visibility, teamIds }) and manages "shared" grants
 * directly through the visibility server actions.
 *
 * Since migration 0041 the workflow/agent rows store the LITERAL four-level
 * value, so `toLegacyVisibilityColumn` is an identity (kept so call sites
 * don't churn) and `fromLegacyVisibilityColumn` reads both modern and legacy
 * ("public" | "readonly") stored values. See the note in
 * docs/collaboration/visibility.mdx ("Stored value ↔ picker mapping").
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
  type StoredVisibilityColumn,
  fromLegacyVisibilityColumn,
  toLegacyVisibilityColumn,
} from "./legacy-mapping";
