# Wave 5 — Company MCP & Tools

**Goal:** Curate a central registry of approved company MCP servers and tools, authenticated by a dedicated agent identity, with per-team access control — so employees can act on company systems safely from chat.
**Ships:** The assistant becomes "connected" to company systems (issue tracker, docs, drive, internal services) under central control.
**Depends on:** Wave 4 (teams/roles/allow-lists to scope tool access). Builds on upstream MCP (`src/lib/ai/mcp/`).
**Phase:** GA path.

## Scope

**In scope**
- **Company MCP registry:** centrally configured, vetted MCP servers available org-wide or per-team (not per-user ad-hoc additions for general users).
- **Agent identity:** company MCP connections authenticate via the dedicated agent SSO identity rather than individual developer credentials, where the connector model allows.
- **Per-team tool access:** which MCP servers/tools a team may use, set by admins (extends Wave 4 allow-lists to tools).
- **Tool/server customizations:** leverage upstream per-tool/per-server customization to add company-specific instructions/guardrails.
- **Curated agent/tool catalog UI:** users browse and enable approved tools; admins manage the catalog.
- **Audit:** record tool invocations (who, which tool, when) for security review.

**Out of scope (this wave)**
- Letting general users register arbitrary external MCP servers (admin-curated only for v1). Building new MCP servers from scratch (separate effort; this wave consumes existing ones). RAG (Wave 6).

## Tasks

- [ ] Inventory the company MCP servers/tools to register first (with Security/IT) and how each authenticates. — OPEN: organizational task (Security/IT decision on which servers + auth posture)
- [x] Configure the agent identity for MCP connections; store credentials/secrets via env/secret manager (never in code). — done via per-**server** (not per-user) OAuth sessions (`mcp_oauth_session` keyed by `mcp_server_id`) and admin-registered credentials; cluster secrets via `deploy/k8s/external-secret.yaml`
- [x] Build the company MCP registry on top of `src/lib/ai/mcp/` config storage; mark servers org-wide vs per-team. — `McpServerTable` `scope: org|team` + multi-team `teamIds`; `src/lib/admin/mcp-servers.ts`
- [x] Add per-team tool/server access to the policy model (extends Wave 4); enforce at tool-load time in the chat route (`loadMcpTools`). — done via `mcp-repository.selectAllForUser` (team-membership join), so only visible servers' tools load; plus per-tool entitlement gates (`enabled`/disabled tool names on the server row)
- [x] Apply company tool/server customizations (instructions/guardrails) via the upstream customization tables. — upstream per-server/per-tool customization tables retained (`/api/mcp/server-customizations`, `tool-customizations`); platform guardrails incl. tool-output spotlighting in `src/lib/ai/guardrails`
- [x] Build the curated catalog UI (browse/enable approved tools) + admin management of the registry. — user MCP catalog + `admin/mcp` (multi-team scoping, live connection test, OAuth/SSO)
- [x] Implement a tool-invocation audit log (user, team, server, tool, timestamp, outcome); surface to admins. — `auditMcpInvocation` → `asafe_mcp_invocation_log` (user, team, server, tool, outcome, duration); surfaced in the admin area (`tests/asafe/mcp-audit.spec.ts`)
- [x] Restrict general users from adding arbitrary MCP servers; keep that admin-only. — admin role check in `src/app/api/mcp/actions.ts`
- [x] Tests: a team without access cannot load a restricted tool; agent-identity auth works; audit rows are written; e2e: enable an approved tool and invoke it. — `tests/asafe/mcp-org-scope.spec.ts`, `tests/asafe/mcp-audit.spec.ts`, `tests/permissions/mcp-permissions.spec.ts` + unit tests (`mcp-servers.test.ts`, `audit.test.ts`)

## Acceptance criteria

- [x] Given an admin-registered company MCP server, when an authorized team member opens the catalog, then they can enable and use its tools.
- [x] Given a team without access to a server, when its members chat, then those tools are not available to them. — team-scoped visibility in `mcp-repository.pg.ts`; `tests/asafe/mcp-org-scope.spec.ts`
- [x] Given a company connection, when it authenticates, then it uses the agent identity (where supported), not personal developer credentials. — OAuth sessions are keyed per server, shared by all authorized users
- [x] Given any tool invocation, when it runs, then an audit record is written and visible to admins.
- [x] General (non-admin) users cannot register external MCP servers; `pnpm check && pnpm test` green; e2e green. — unit suite verified 2026-06-11 (one unrelated Wave 9 realtime test failing)

## Open questions

- [Security/IT] Which MCP servers are approved first, and which support a service/agent identity vs. requiring per-user OAuth?
- [Security] Audit retention period and who reviews it.
- [Product] Should some power-user teams be allowed to self-register servers, or strictly admin-curated for all? — current behavior: strictly admin-curated

---
**How to verify:** `pnpm test src/lib/ai/mcp src/lib/admin/mcp-servers.test.ts` (unit); `pnpm test:e2e tests/asafe/mcp-org-scope.spec.ts tests/asafe/mcp-audit.spec.ts tests/permissions/mcp-permissions.spec.ts` (needs running stack + seed); manage the registry at `/admin/mcp`, audit at `/admin/audit`.
