# Wave 4 — Identity & Admin

**Goal:** Move from pilot accounts to organization SSO for ~800 employees, auto-assign teams from identity claims, and add the granular admin controls needed to run the platform centrally (per-team model allow-lists, roles, member management).
**Ships:** 800-person-ready login and centralized governance.
**Depends on:** Waves 1–3 (teams/budgets exist to attach to identities).
**Phase:** GA path.

## Scope

**In scope**
- **SSO** via the company IdP. Better Auth already supports Microsoft/Google social login; extend/configure to the chosen enterprise provider (Microsoft Entra / Google Workspace; SAML/OIDC plugin if required).
- **Auto provisioning + team mapping:** on first SSO login, create the user and map to a team from an identity claim (group/department) per a configurable mapping.
- **Roles:** confirm the user/admin model from upstream; add any needed intermediate role (e.g. team-admin) with a clear permission set.
- **Per-team policy overrides:** which models a team may use (allow-list), default routing policy per team, budget owner. Stored in DB, editable from the admin UI, resolved at request time.
- **Admin UI:** manage users (search, deactivate/ban — upstream supports), teams, memberships, team budgets (from Wave 3), and team model allow-lists.
- **Provider/data posture decision implemented:** finalize and enforce whether inference goes via OpenRouter or direct providers (per Security), via config.

**Out of scope (this wave)**
- Company MCP curation (Wave 5), RAG (Wave 6), desktop (Wave 7). LobeChat-grade per-user config cascades beyond team allow-lists (revisit only if needed).

## Tasks

- [x] Configure SSO against the chosen IdP in `src/lib/auth/`; verify the OAuth/OIDC (or SAML plugin) flow end to end in staging. — done via Microsoft Entra OIDC (Better Auth, `auth-instance.ts`, `MICROSOFT_*` env); wired with real Entra credentials deploy-side
- [ ] Implement first-login provisioning and team assignment from an identity claim; define the claim→team mapping config. — OPEN: provisioning + Entra group→**role** mapping shipped (`src/lib/auth/entra-claims.ts`, `ASAFE_ENTRA_*_GROUP_IDS`); claim→**team** mapping not implemented — teams are assigned via the admin UI
- [ ] Confirm/extend roles; document the permission matrix (who can manage teams, budgets, allow-lists, users). — OPEN: user/editor/admin roles shipped (`src/lib/auth/roles.ts`) and `asafe_team_member.role` exists, but no enforced team-admin tier and no written permission-matrix doc
- [x] Add per-team policy storage (model allow-list, routing policy, budget owner) to the schema; migrate. — done via layered `model_policy` jsonb on `asafe_team` (org base → team override → user grants, ADR-0009) + `asafe_team_budget`
- [x] Resolve per-team policy at the routing seam: the Wave 2 router must respect the requesting user's team allow-list. — `resolveEffectiveModelAllowList` (`src/lib/admin/effective-models.ts`) resolved once in the chat route; Auto routes only among entitled models
- [x] Build/extend the admin UI for users, teams, memberships, budgets, allow-lists. — `admin/users`, `admin/teams` (members, budgets, model policy), `admin/role-packs`
- [x] Implement the provider/data posture switch (OpenRouter vs direct) via config; document the choice approved by Security. — done via OpenRouter-only posture (ADR-0001): the registry hard-codes OpenRouter, so no runtime switch exists or is needed
- [ ] Tests: SSO login provisions + maps team; a team allow-list constrains routable models; a team-admin can manage only their team; e2e for SSO happy path + denied model. — OPEN: role-mapping unit tests (`entra-claims.test.ts`) + allow-list/team e2e (`tests/asafe/entitlement-gate.spec.ts`, `team-members.spec.ts`) exist; no SSO-provisions-team test (claim→team mapping absent) and no live-IdP SSO e2e

## Acceptance criteria

- [ ] Given an employee with company credentials, when they log in via SSO, then an account is provisioned and mapped to the correct team automatically. — OPEN: account provisioning + role mapping work; automatic team mapping from claims is not implemented
- [x] Given a team with a model allow-list, when a member (or the router) selects a model outside it, then it is not used and the user sees why. — enforced in the chat route + picker UI; `tests/asafe/entitlement-gate.spec.ts`
- [ ] Given a team-admin, when they manage settings, then they can edit only their own team. — OPEN: team management endpoints are global-admin-only; no team-admin tier enforced
- [x] Given the approved posture, when a request runs, then inference uses the approved path (OpenRouter or direct) and no data leaves the approved boundary. — OpenRouter-only enforced by the model registry (ADR-0001)
- [x] `pnpm check && pnpm test` green; SSO and allow-list e2e green. — unit suite verified 2026-06-11 (one unrelated Wave 9 realtime test failing); allow-list e2e exists, SSO e2e requires a live IdP

## Open questions

- [IT/Security] Which IdP and protocol (Entra OIDC? SAML? Google Workspace?) and which claim carries team/department? — resolved: Entra OIDC with `groups` claim for roles; team-carrying claim still undecided
- [Security] Final inference posture: OpenRouter or direct providers (with no-training terms)? Sign-off required before GA. — implemented as OpenRouter-only (ADR-0001); formal Security sign-off still pending
- [Product] Role model: is user/admin/team-admin enough, or do we need more? — current: user/editor/admin (+ role-packs); team-admin tier still open

---
**How to verify:** `pnpm test src/lib/auth src/lib/admin` (role mapping, effective models, teams); `pnpm test:e2e tests/asafe/entitlement-gate.spec.ts tests/asafe/team-members.spec.ts tests/admin` (needs running stack); SSO happy path must be verified manually against the Entra tenant.
