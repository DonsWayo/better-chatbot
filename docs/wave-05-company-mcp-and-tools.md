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

- [ ] Inventory the company MCP servers/tools to register first (with Security/IT) and how each authenticates.
- [ ] Configure the agent identity for MCP connections; store credentials/secrets via env/secret manager (never in code).
- [ ] Build the company MCP registry on top of `src/lib/ai/mcp/` config storage; mark servers org-wide vs per-team.
- [ ] Add per-team tool/server access to the policy model (extends Wave 4); enforce at tool-load time in the chat route (`loadMcpTools`).
- [ ] Apply company tool/server customizations (instructions/guardrails) via the upstream customization tables.
- [ ] Build the curated catalog UI (browse/enable approved tools) + admin management of the registry.
- [ ] Implement a tool-invocation audit log (user, team, server, tool, timestamp, outcome); surface to admins.
- [ ] Restrict general users from adding arbitrary MCP servers; keep that admin-only.
- [ ] Tests: a team without access cannot load a restricted tool; agent-identity auth works; audit rows are written; e2e: enable an approved tool and invoke it.

## Acceptance criteria

- [ ] Given an admin-registered company MCP server, when an authorized team member opens the catalog, then they can enable and use its tools.
- [ ] Given a team without access to a server, when its members chat, then those tools are not available to them.
- [ ] Given a company connection, when it authenticates, then it uses the agent identity (where supported), not personal developer credentials.
- [ ] Given any tool invocation, when it runs, then an audit record is written and visible to admins.
- [ ] General (non-admin) users cannot register external MCP servers; `pnpm check && pnpm test` green; e2e green.

## Open questions

- [Security/IT] Which MCP servers are approved first, and which support a service/agent identity vs. requiring per-user OAuth?
- [Security] Audit retention period and who reviews it.
- [Product] Should some power-user teams be allowed to self-register servers, or strictly admin-curated for all?
