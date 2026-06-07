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

- [ ] Configure SSO against the chosen IdP in `src/lib/auth/`; verify the OAuth/OIDC (or SAML plugin) flow end to end in staging.
- [ ] Implement first-login provisioning and team assignment from an identity claim; define the claim→team mapping config.
- [ ] Confirm/extend roles; document the permission matrix (who can manage teams, budgets, allow-lists, users).
- [ ] Add per-team policy storage (model allow-list, routing policy, budget owner) to the schema; migrate.
- [ ] Resolve per-team policy at the routing seam: the Wave 2 router must respect the requesting user's team allow-list.
- [ ] Build/extend the admin UI for users, teams, memberships, budgets, allow-lists.
- [ ] Implement the provider/data posture switch (OpenRouter vs direct) via config; document the choice approved by Security.
- [ ] Tests: SSO login provisions + maps team; a team allow-list constrains routable models; a team-admin can manage only their team; e2e for SSO happy path + denied model.

## Acceptance criteria

- [ ] Given an employee with company credentials, when they log in via SSO, then an account is provisioned and mapped to the correct team automatically.
- [ ] Given a team with a model allow-list, when a member (or the router) selects a model outside it, then it is not used and the user sees why.
- [ ] Given a team-admin, when they manage settings, then they can edit only their own team.
- [ ] Given the approved posture, when a request runs, then inference uses the approved path (OpenRouter or direct) and no data leaves the approved boundary.
- [ ] `pnpm check && pnpm test` green; SSO and allow-list e2e green.

## Open questions

- [IT/Security] Which IdP and protocol (Entra OIDC? SAML? Google Workspace?) and which claim carries team/department?
- [Security] Final inference posture: OpenRouter or direct providers (with no-training terms)? Sign-off required before GA.
- [Product] Role model: is user/admin/team-admin enough, or do we need more?
