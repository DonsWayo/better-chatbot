# ADR-0009: Fine-grained entitlements (capabilities per team & per user)

**Status:** Accepted (direction set 2026-06-07 by A Safe) — designed here, enforced in Waves 2/4/5
**Date:** 2026-06-07
**Deciders:** Product, Engineering, Security
**Gates:** Wave 2 (model-select gating), Wave 4 (policy model + admin UI), Wave 5 (tools/MCP)

## Context

A Safe requires that capabilities are **not on by default** for normal users. Choosing the model,
using tools, MCP, multimodal (image/voice), workflows, creating/sharing agents, etc. must be
**default-deny**, **grantable per team and per user**, and managed centrally in **admin** — fully
fine-grained.

Current state:
- Upstream shows the **model picker** and **tools** to everyone; the default role is `editor`
  (can create agents/workflows/MCP). Roles are coarse (`admin` / `editor` / `user`,
  `src/lib/auth/{roles,permissions}.ts`).
- The chat route trusts the client-supplied `chatModel` and tool selections — so hiding the UI is
  **not enough**; a user could craft a request. Enforcement must be **server-side**.

This is the entitlements layer that the spec only sketched (per-team allow-lists in Wave 4,
per-team tool access in Wave 5). A Safe wants it **finer**: per team **and** per user, per
capability, default-deny.

## Decision

- **A capability model resolved per request**, layering most-specific-wins:
  `global defaults ⊕ team policy ⊕ user override`. Privileged capabilities **default to deny**
  for the `user` role.
- **Initial capability taxonomy** (extensible per wave):
  - `model.select` — may the user pick a model at all (vs. forced **Auto**/assigned routing, ADR-0004)
  - `model.allow` — the allowed model list/tiers when selection is permitted
  - `tools.appDefault` — built-in toolkits (per toolkit)
  - `tools.mcp` — MCP servers/tools (per server/tool — ties to Wave 5)
  - `multimodal.imageGen`, `multimodal.voice`
  - `workflows.use`, `agents.create`, `agents.share`
  - `mcp.register` (already admin-only — folds in here)
  - (grows: RAG collections in W6, etc.)
- **Defaults for role `user`:** chat only, **forced Auto model (no picker)**, **no tools**, no
  multimodal, no agent/workflow authoring. `editor`/`team-admin`/`admin` and explicitly-granted
  users get more. Exact defaults = a Product open input below.
- **Storage (extends ADR-0002):**
  - `team_policy(team_id, capabilities jsonb, model_allow jsonb, …)`
  - `user_entitlement(user_id, overrides jsonb)`
  - admin-editable; resolved by a `resolveEntitlements(session, team)` helper (builds on
    `resolveUserTeam`), cached per request.
- **Server-side enforcement at every consumption point — the UI only mirrors it:**
  - **Chat route** (`route.ts`): if `model.select` is not granted, **ignore the client
    `chatModel`** and use the routed/assigned model; **filter** MCP + app tools by entitlements at
    load time; gate multimodal.
  - **UI**: hide the model picker / tools button / multimodal controls unless granted (cosmetic).
- **Admin UI (Wave 4):** a per-team **and** per-user capability matrix; Wave 5 extends to
  per-MCP-server / per-tool granularity.

## Options Considered

### Option A: capability model, team ⊕ user, default-deny (chosen — A Safe direction)
**Pros:** fine-grained governance per team and per person; safe-by-default; matches "safe
enablement" (Wave 7). **Cons:** a real policy-resolution layer + admin matrix to build; must
enforce server-side everywhere.

### Option B: role-only (admin/editor/user)
**Pros:** already exists. **Cons:** far too coarse — can't express per-team or per-user grants.
**Rejected.**

### Option C: per-team only (Wave 4 allow-lists as specced)
**Pros:** simpler. **Cons:** A Safe explicitly wants **per-user** too. **Rejected** in favour of
team ⊕ user.

## Trade-off Analysis

The decisive constraint is **server-side enforcement of default-deny** with **two grant scopes
(team and user)**. Roles alone can't express "this one person on the Legal team may pick models,
nobody else can." A capability set resolved as `defaults ⊕ team ⊕ user` does, and gating it at the
chat route (not just the UI) makes it real. The cost is a policy table + resolver + admin matrix —
work that Wave 4/5 already implied; we're making it finer and default-deny.

## Consequences

- **Easier:** central, auditable control; safe defaults out of the box; one resolver every wave
  reuses; aligns with guardrails (Wave 7) and audit (Wave 8).
- **Harder:** every capability-consuming seam must check entitlements server-side; UI and server
  must stay in sync; the admin matrix is real UI work.
- **Revisit:** the taxonomy grows each wave; consider a Better Auth AC integration vs. our own
  resolver when implementing (keep it in our custom AC per ADR-0002).

## Open inputs needed

- **[Product]** Confirm the default capability set per role (proposed: `user` = chat-only, forced
  Auto model, no tools/multimodal/authoring).
- **[Product]** Which capabilities are team-grantable, user-grantable, or both.
- **[Security]** Is `model.select` ever allowed for non-admins, or always Auto except for admins?

## Action items

1. [ ] (W2) Server-enforce: ignore client `chatModel` unless `model.select` granted → use routed model; hide the picker by default.
2. [ ] (W3/W4) Add `team_policy` + `user_entitlement` tables (ADR-0002 schema); build `resolveEntitlements`.
3. [ ] (W4) Admin UI: per-team **and** per-user capability matrix.
4. [ ] (W5) Extend entitlements to per-MCP-server / per-tool.
5. [ ] (W4+) Gate multimodal, workflows, agent authoring behind entitlements; keep UI mirrored.
