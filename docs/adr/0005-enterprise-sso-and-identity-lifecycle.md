# ADR-0005: Enterprise SSO & identity lifecycle

**Status:** Accepted (IdP decided 2026-06-07: Microsoft Entra ID via OIDC)
**Date:** 2026-06-07
**Deciders:** IT (IdP), Security
**Gates:** Wave 4 (SSO + team mapping), Wave 8 (SCIM lifecycle)

## Context

The pilot uses email/password and social OAuth. For 800 employees we need **organization SSO**,
**auto-provisioning with team mapping from an identity claim**, and (Wave 8, GA gate) a
**joiner/mover/leaver** lifecycle so access is correct and revocable.

Current state (verified):
- Better Auth with **Google / GitHub / Microsoft social OAuth**, env-gated
  (`src/lib/auth/config.ts`); Microsoft supports a tenant ID. Email/password on by default.
- **No enterprise federation** (no SAML, no generic OIDC SSO plugin) and **no SCIM**.
- A user-create **DB hook already exists** (`auth-instance.ts` ~L59–82) that sets the first user
  to `admin` — the natural place to add claim→team mapping.
- Tenancy tables come from ADR-0002.

## Decision

- **Use enterprise OIDC via Better Auth as the primary SSO**, not SAML. **Primary IdP: Microsoft
  Entra ID — confirmed** (A Safe runs Microsoft 365 / Entra org-wide). Upstream already ships a
  Microsoft provider with tenant support, so this extends existing code rather than starting cold.
- **Auto-provision on first SSO login** and **map to a team from a configurable claim**
  (`groups` or `department`) via a `team_mapping` config/table (claim value → team_id), resolved
  in the existing user-create hook. Unmapped users land in a default team and are flagged for an
  admin.
- **Identity lifecycle via SCIM 2.0** (preferred) **or IdP webhooks** as fallback:
  provision/update/**deprovision** so leavers lose access promptly and movers get re-scoped. Keep
  **first-user-admin** and an emergency local-admin account as break-glass.
- **Roles** map from claims onto the ADR-0002 role set (`admin` / `team-admin` / `editor` /
  `user`). Default role configurable (`DEFAULT_USER_ROLE` already exists).
- **Posture:** the agent/service identity for company MCP (Wave 5) is a *separate* identity from
  employee SSO; do not reuse personal tokens (tracked in Wave 5, noted here for coherence).
  Because A Safe is all-Microsoft, **Microsoft Graph / M365 (Teams, SharePoint, OneDrive) are
  natural Wave 5 MCP targets** under this same Entra tenant.

## Options Considered

### Option A: OIDC via Better Auth (recommended)
| Dimension | Assessment |
|-----------|------------|
| Complexity | Medium — configure IdP app + claim mapping |
| Fit | Strong — Better Auth + Entra/Google both speak OIDC; group claims available |
| Lifecycle | Pairs with SCIM cleanly |

**Pros:** modern, JSON claims (easy group/department mapping), least friction with the existing
social-OAuth setup. **Cons:** group-claim shapes differ per IdP; needs IdP app registration.

### Option B: SAML federation
**Pros:** ubiquitous in legacy enterprise IT. **Cons:** heavier; XML assertion handling; Better
Auth SAML support is less first-class than OIDC; only choose if IT mandates it.

### Option C: Keep social OAuth only
**Rejected** — no enterprise group claims, no central deprovisioning, fails Wave 8.

## Trade-off Analysis

OIDC and SAML both authenticate; the differentiator for *this* platform is **getting the team and
role from a claim and supporting central deprovisioning**. OIDC delivers group/department claims
as JSON that map directly onto ADR-0002 tables and pairs naturally with SCIM for lifecycle. SAML
is a fallback we accept only if IT's IdP can't do OIDC. The actual blocker is not the protocol —
it is two facts only IT has: *which IdP* and *which claim carries the team*.

## Consequences

- **Easier:** one-click employee login; correct team/role on day one; leavers auto-revoked (Wave 8
  acceptance).
- **Harder:** per-IdP claim-mapping config; SCIM endpoint to build/operate; testing the
  deprovision path.
- **Revisit:** multi-IdP (e.g., contractors on a second IdP) if the org needs it.

## Open inputs needed

- ✅ **[IT] IdP + protocol — DECIDED: Microsoft Entra ID via OIDC** (M365 org-wide).
- **[IT]** Which Entra claim carries team/department (`groups` object IDs vs. a custom `department`
  claim), and the claim-value → team-name map.
- **[IT/Security]** SCIM source of truth (Entra provisioning) and the deprovisioning SLA (Wave 8).

## Action items

1. [ ] (W4) Register the IdP application; configure OIDC in `src/lib/auth/`; verify the flow in staging.
2. [ ] (W4) Add a `team_mapping` table/config; extend the user-create hook to map claim→team + role.
3. [ ] (W4) Admin UI to manage team mappings + reassign unmapped users.
4. [ ] (W8) Implement SCIM 2.0 (or IdP webhook) provisioning/deprovisioning; test leaver + mover.
5. [ ] (W4) e2e: SSO login provisions + maps team; denied model outside team allow-list.
