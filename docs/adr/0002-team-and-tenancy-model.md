# ADR-0002: Team & tenancy data model

**Status:** Proposed
**Date:** 2026-06-07
**Deciders:** Engineering, Product
**Gates:** Wave 3 (budgets/usage) through Wave 9 — this is the most cross-cutting decision in the plan

## Context

"Team" is the spine of the whole platform: budgets (W3), model allow-lists (W4), MCP/tool access
(W5), RAG collection visibility (W6), guardrail policy (W7), and audit scoping (W8) are all
*per-team*. Get the tenancy model wrong and every one of those waves inherits the mistake.

Current state (verified):
- **No team concept exists** — no `team`/`team_member` tables, no org plugin enabled.
- The app already has a **custom** authorization layer: roles `admin` / `editor` / `user`
  (`src/lib/auth/roles.ts`) and a granular permission AC (`src/lib/auth/permissions.ts`), wired
  into a Better Auth admin plugin and an admin UI at `/admin/users`.
- Better Auth ships an **organization plugin** (organization / member / invitation / team
  primitives) that is available but **not** installed.
- The Wave 3 spec already *designs* custom tables: `team`, `team_member`, `usage_event`,
  `team_budget`, with `usage_event` carrying `team` and `user` foreign keys.

So the real fork is: **adopt Better Auth's organization plugin** for tenancy, or **build custom
`team` tables** in the existing Drizzle schema and extend the existing custom AC.

## Decision

**Build custom `team` and `team_member` tables** in `src/lib/db/pg/schema.pg.ts`, and thread a
`team_id` foreign key into every team-scoped table we add (`usage_event`, `team_budget`,
team policy/allow-list, RAG `embeddings`, `audit_log`). **Extend the existing custom permission
AC** with a `team-admin` capability set rather than adopting the Better Auth organization plugin.

Resolve the requesting user's team **once per request** at the auth seam (a
`resolveUserTeam(session)` helper) and pass it through the routing → guard → meter → retrieve
layers, so no downstream code re-queries membership.

Membership for the pilot is seeded/manual (Wave 3); auto-assignment from an SSO claim arrives in
Wave 4 (ADR-0005) and writes into these *same* tables.

**Scope for v1:** a user belongs to exactly **one** team (1:N). `team_member` is modelled as a
join table anyway so multi-team is a later, additive change, but UI and budget logic assume a
single "home" team to keep the cut line simple.

## Options Considered

### Option A: Custom `team` tables + extend existing AC (recommended)
| Dimension | Assessment |
|-----------|------------|
| Complexity | Medium — we write membership CRUD + a `team-admin` role |
| Schema fit | Excellent — clean FKs to `usage_event`/budget/embeddings/audit, matches Wave 3 spec |
| Upstream-merge risk | Low — additive tables, our own modules; doesn't fight upstream auth |
| Reversibility | Medium |

**Pros:** one tenancy concept everywhere; FKs exactly match the metering/RAG/audit designs;
reuses the AC pattern already in the repo; not coupled to Better Auth's plugin upgrade cadence.
**Cons:** we own invitations/membership UI and the role plumbing.

### Option B: Better Auth organization plugin
| Dimension | Assessment |
|-----------|------------|
| Complexity | Low up front (invitations/roles free), higher to integrate with custom needs |
| Schema fit | Poor — its `organization`/`member` model doesn't naturally own `usage_event`/budget FKs; we'd FK to its tables and bend our metering to its shape |
| Upstream-merge risk | Medium — couples tenancy to the plugin + Better Auth versioning |
| Reversibility | Low — data lands in plugin-owned tables |

**Pros:** invitations, org roles, switching out of the box. **Cons:** the plugin's data model is
built for SaaS multi-org self-signup, not central HR-driven team assignment; our budget/usage/RAG
FKs would straddle two ownership models; mixing it with the *existing* custom AC creates two
overlapping permission systems.

### Option C: Hybrid — org plugin for membership, custom tables for budgets
**Pros:** less membership code. **Cons:** two sources of truth for "who is in what team";
constant translation between plugin IDs and our FKs; worst of both for not much gain. Rejected.

## Trade-off Analysis

The decisive factor is **where `usage_event`, `team_budget`, RAG `embeddings`, and `audit_log`
point their foreign keys.** Those are the tables that make this product different from upstream,
and the spec already designs them around a custom `team`. Option B would force those
differentiating tables to depend on a plugin's schema we don't control and can't cleanly extend,
and would run a second permission system alongside the custom AC that already exists. Option A
keeps a single tenancy concept that every later wave FKs into cleanly, at the cost of writing
membership CRUD we'd largely write anyway.

## Consequences

- **Easier:** every later wave (3–9) has one obvious place to scope by team; metering/RAG/audit
  FKs are clean; the existing AC pattern extends naturally to `team-admin`.
- **Harder:** we build team membership management UI and invitation/seed flows ourselves.
- **Revisit:** if we ever go multi-org/customer-facing (explicitly a non-goal), reconsider the
  org plugin then.

## Open inputs needed

- **[Product]** Confirm v1 is single-team-per-user (recommended) vs. multi-team from the start.
- **[Product]** Is `team-admin` (manages only their own team) the right intermediate role, or do
  we need finer roles? (ADR-0005 SSO will map claims onto whatever we pick.)

## Action items

1. [ ] (W3) Add `team`, `team_member` to `schema.pg.ts`; `team_member` carries an in-team role; generate + run migration.
2. [ ] (W3) Add a `team-admin` role/capability set to `src/lib/auth/roles.ts` + `permissions.ts`.
3. [ ] (W3) Add a `resolveUserTeam(session)` helper used by the chat route before routing/metering.
4. [ ] (W3) Seed initial teams + memberships for the pilot.
5. [ ] (W4) SSO claim→team mapping writes into these tables (see ADR-0005).
