# Unified Visibility & Sharing Model

> Juan's rule (2026-06-10): "workflows can be private, shared, team or company —
> think in all things like that." One mental model for EVERY shareable entity.

## The four levels

| Level | Who can see/use | Who can grant |
|---|---|---|
| `private` | owner only | — (default for everything) |
| `shared` | explicitly named users (grant list) | owner |
| `team` | members of one or more teams (`teamIds[]`) | owner if member; admins |
| `company` | the whole org | admins only (curation gate) |

Orthogonal axes kept separate on purpose:
- **Visibility** (above) ≠ **capability** (view / use / edit / manage — an entity is
  usable org-wide but editable only by its owner + admins) ≠ **lifecycle**
  (draft / published — revisions gate what the org-wide audience actually runs).

## Current state per entity → target

| Entity | Today | Gap to close |
|---|---|---|
| MCP servers | personal / org / team + `teamIds[]` | rename mental model: org→company; add `shared` grant list (low priority) |
| Agent/workflow **revisions** | `teamIds[]` + `orgWide` | already the target model minus `shared` |
| Workflows (live) | `visibility: private/public` + isPublished | **migrate** public→company; add team/`teamIds[]` + shared |
| Agents | private/public-ish sharing | same migration as workflows |
| Threads | private/team via folder (teamspaces phase 1) | add `shared` (named users) + company (rare, admin-gated) |
| Folders (teamspaces) | private/team | add shared + company curation |
| Knowledge collections | org/team scoped | add private + shared; align field names |
| Schedules/routines | owner-scoped | inherit the workflow's visibility for *viewing*; runs visible per Runs rules |
| Runs/sessions | owner + admins (+ folder members read-only, phase 1) | follows the folder/thread container |

## Implementation rules

1. **One shape everywhere**: `visibility: "private"|"shared"|"team"|"company"`,
   `teamIds: uuid[] | null`, plus a generic `entity_grant` table
   (entityType, entityId, userId, capability) for `shared`.
2. **One resolver**: `canAccess(entity, userId, capability)` in a shared lib
   (`src/lib/visibility/`), mirroring how model-policy/autonomy resolve org→team→user.
   No per-feature bespoke checks once migrated.
3. **Company level always passes the admin curation gate** (same as featured MCP
   servers and org-wide revisions today).
4. **UI**: one `VisibilityPicker` component (icon: lock / link-user / users / building)
   reused everywhere — picker order private → shared → team → company, with the
   team multi-select combobox from the MCP catalog.
5. Entitlements still apply on top: visibility never bypasses model allow-lists,
   tool gates, budgets, or guardrails.

## Migration order (follow-up task)

1. `entity_grant` table + `src/lib/visibility/` resolver (+ tests).
2. Workflows + agents: visibility enum migration (public→company), `teamIds[]`.
3. VisibilityPicker component; wire into workflow/agent editors.
4. Threads/folders `shared`; knowledge collections alignment.
