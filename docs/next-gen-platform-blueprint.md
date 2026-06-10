# A-SAFE AI — Next-Generation Platform Blueprint

## North Star (3 sentences)

asafe-ai becomes A-SAFE's single governed gateway to AI: every employee — from a Rotherham production planner to a Madrid sales rep — gets task-routed intelligence with zero model-choice anxiety, while IT keeps one policy surface (entitlements, budgets, audit) instead of five shadow-AI subscriptions. The funding pitch is **cost-controlled substitution**: replace per-seat ChatGPT Enterprise/Copilot sprawl (~$30–60/user/month) with metered, budget-governed OpenRouter spend, with the Usage dashboard CSV as the monthly CFO artifact. The 12-month destination is GitHub Agent HQ's insight applied to knowledge work: one mission-control surface where departments assign, watch, and audit autonomous workflows — chat is the ingress, but the **session** is the governed, auditable, budget-charged unit of value.

## Web platform (what to build, on top of what exists)

- **Sessions/Runs rail** (mission control): a global "Runs" drawer listing every in-flight workflow/agent execution with live status, cost-so-far, steer/abort, and archive-vs-delete lifecycle. New `agent_session` table in `src/lib/db/pg/schema.pg.ts` (id, agentId/workflowId, teamId, userId, status, mode, costSoFar, originSurface); UI in the `(chat)` layout sidebar; admin-wide view beside the existing admin suite.
- **Permanent run transcripts** at `/runs/[id]`, with the URL injected into tool-execution context so agent outputs in Jira/Confluence/email say "produced by asafe-ai run <link>". This is the audit story compliance signs off on. **Honesty note:** runs are *not* fully persisted today — making "state outlives compute" true is engineering work (see Agents & workflows), not a route.
- **Role packs** — the #1 zero-config adoption lever: one-click bundles of agent + workflows + MCP connectors + KB collections per function. "Sales pack" (CRM connector + quote-drafting workflow + product KB), "Manufacturing Ops pack" (line-KPI Live Artifact + shift-handover summarizer). A join table over entities that already exist; nobody configures anything. Success metric: **weekly active per department** in the Usage dashboard.
- **Per-session connector mask**: a chip row above the composer shows which MCP Catalog servers are active for *this* thread, default minimal for plain users; stored on the thread row, enforced as a filter in the tool-loading pipeline (`src/lib/ai/mcp`).
- **Live Artifacts**: an artifact row stores widget code + a refresh-workflow id; opening re-executes via `src/lib/ai/workflow`. The killer demo for ops dashboards bound to ERP connectors.
- **Cost transparency before expensive operations**: "~£0.40, charged to Engineering budget" shown before any multi-agent, Best-of-N, or Deep-check run, wired to `src/lib/ai/budget`. Directly serves the CFO substitution pitch.

**The wow moment** (exec demo script): a sales rep says "build me a weekly pipeline digest," watches NL workflow generation compile it into a React Flow graph, approves the numbered plan, and it runs every Monday forever — visible to her team, charged to her team's budget, linked from every output.

## Desktop role (why Electron earns its place)

- **Local stdio MCP bridge behind a server-managed policy plane** — closes ADR-0010 (`docs/adr/0010-desktop-electron.md`). **Non-negotiable sequencing: the signed policy plane ships *before* the bridge.** On launch, Electron pulls a signed policy document (allowed stdio servers, filesystem roots, egress rules) that local config can never widen; filesystem roots and egress are enforced **in the bridge process itself**, not just at install (Claude's documented post-install-tampering gap). New "Desktop" scope in the MCP Catalog (`src/lib/admin/mcp-servers.ts`), disabled by default, no sideloading. Adopt the open `.mcpb` manifest format rather than inventing one; distribute via the existing auto-update scaffold.
- **Teleport/handoff**: a "Continue on desktop" chip appears when a chat needs local tools, opening `asafe://chat/<id>` via the existing deep-link handler; the inverse is free since state is server-side Postgres.
- **"My Work" supervision panel**: tray badge + native notifications for run complete/fail and **pending approvals**, fed by `agent_session`, plus an always-on-top mini window for watching long runs. This gives the thin client a job long before local execution matters.
- **Assign-from-anywhere**: extend `asafe://` to `asafe://agent/run?agentId=...&prompt=...` so Teams/Outlook/intranet links launch pre-filled sessions.
- Offline is explicitly **not** the pitch — Postgres-backed state, notifications, and governed local tools are.

## Agents & workflows

- **Versioned, governed agent definitions**: an immutable revision-history table for agents/workflows; new revisions need an admin approval flag before becoming org-invocable; revisions logged through `src/lib/admin/audit.ts`. Org Agent Catalog reuses the MCP Catalog's multi-team scoping UI. This *is* the agreed "persistent/versioned workflow agents" vision item.
- **NL workflow generation as "Cowork-lite"**: describe a task → Claude compiles it to a node graph (existing input/llm/condition/tool/http/template/output vocabulary) → user watches plan + checklist execute. New **`approval` node type**: the run pauses in Postgres until a human approves the numbered plan.
- **Autonomy enum — Interactive / Plan / Autopilot — resolved through the SAME org→team→user entitlement layering already built for models** (`src/lib/ai/model-allow-list.ts` pattern): one resolver, not a parallel permission system. Plain users: Interactive only. **GitHub-style gating: every autonomy feature ships disabled by default and is enabled per-team only after its corresponding governance floor exists** (budget hard-stop, kill-switch coverage, severity-capped guardrails).
- **Routines/scheduled automations**: `workflow_schedule` table + a **dedicated SKIP LOCKED worker Deployment** in `deploy/helm` with its own connection pool and statement timeouts (the `api/cron` route is the tick ingress); partition `agent_session`/audit tables early and **load-test the poller before Routines GA** — the honest answer to Postgres wearing four hats (OLTP, queue, vectors, replication source). **`/schedule` in chat converts the current conversation into a routine** — the lowest-friction path from chat to automation. Findings land in a **Triage inbox**; empty runs auto-archive so it stays signal-only. Server-side runs beat Claude Desktop's app-must-stay-open model.
- **Resumable step-row checkpointing**: every node execution writes a resumable step row; **chaos-test pod kills in EKS staging** so "state outlives compute" is a verified property, not a slogan.
- **Best-of-N + Verify/critique node**: fan one prompt across entitled models via OpenRouter or N cheap-tier reviewers via the Auto router (`src/lib/ai/routing`); surface only findings 2+ reviewers reproduce (severity-capped P0/P1); upfront cost preview; N>1 gated by role; feeds the Quality admin page.
- **Code/PR agents: don't build them.** Engineering uses Agent HQ/Claude Code natively; asafe-ai's job is the GitHub connector in the catalog and ingesting agent-authored results via webhook — not competing with four-vendor coding platforms.
- **One polished non-engineering hero routine per quarter** (pipeline digest, line-KPI tracker) — the explicit countermeasure to adoption asymmetry and the leadership-facing proof of "full globally company use."

## Knowledge & context

- pgvector KB (ADR-0007, `src/lib/ai/embeddings`, `src/lib/file-ingest`) is the base; add **Projects as memory + scope boundary**: `project_id` FK on threads, a KB collection per project, pinned instructions injected into the system prompt. Predictable context is a governance feature, not just UX. Org memory = project-scoped memory + existing compression (ADR-0011), not a separate service.
- **Per-user OAuth on org connectors as the DEFAULT**: each user authenticates individually so the assistant inherits *their* SharePoint/ERP/Jira permissions, never a service account's. The MCP Catalog OAuth plumbing already supports this; document it as GDPR data-minimization.
- **Diff-style before/after review screen** for any run output that mutates KB entries (Codex chunk-staging applied to knowledge): approve/publish gates turn scary autonomous writes into reviewable, trustable changes. Cheap to build on the existing ingest pipeline.
- **Graph layer: defer 12 months.** Hybrid retrieval (pgvector + Postgres FTS + recency) with citation-first answers ships first; a knowledge graph without adoption is a science project.
- Department killer use cases land via role packs: engineering (standards retrieval), sales (quote/tender drafting), manufacturing ops (shift handovers, line-KPI Live Artifacts), HR (policy Q&A with Guardrails PII scanning already in place).

## Governance (what is missing)

- **`actorType` ('user'|'agent'|'workflow') + `agentSessionId` on the existing audit log** — a single migration with the highest compliance value per line of code. Ships first.
- **Non-overridable policy floors** (Codex `requirements.toml`): the entitlements layering resolves org→team→user, but everything is overridable today. Add floors: "scheduled runs never get full-access tools", "plain users cannot create automations", "budget hard-stop pauses team automations" — enforced at session start and per-step.
- **Egress allowlists on workflow http/tool nodes**: per-team domain allowlist in a fetch wrapper in the executor; every hostname logged to the Guardrails scan log as a DNS-style audit trail.
- **Compliance API in the first 90 days**: read-only REST export of audit + usage to A-SAFE's SIEM. The tables exist (`src/lib/admin`, `src/app/api/compliance`); it's route + auth work, and it's what gets IT security sign-off *before* any autonomy ships.
- **Runtime permission escalation**: background runs hitting out-of-scope tools pause into "needs approval" with a granular approve/deny card, decision audited. The same gate protects the desktop stdio bridge.
- **Per-tool MCP entitlements per team**: the catalog already probes servers live, so enumerate tools into per-team toggles — extends entitlements from models to tools (12-month wave).

## Realtime & collaboration (ElectricSQL plan)

Phase it, **strictly read-path-only — writes always go through existing API routes so guardrails/budget/audit are never bypassed**: (1) link-shared **read-only thread snapshots** with Private/Team visibility — Team checks recipient team membership *and* the entitlement/KB scope of thread content — no Electric needed; (2) Electric sidecar Deployment in the Helm chart reading Postgres logical replication (no Redis), shapes scoped by teamId for the Runs rail, Triage unread counts, and Electron badges; (3) live shared sessions and collaborative folders last, only after (2) proves the sync layer in production.

## Phased roadmap

**Next 90 days**
- `agent_session` table + Runs drawer + `/runs/[id]` transcripts with linkback; resumable step-row checkpointing
- `actorType`/`agentSessionId` audit migration + **Compliance API** over existing audit/usage tables
- `workflow_schedule` + dedicated SKIP LOCKED worker Deployment + `/schedule` command + Triage inbox, kill-switchable via feature flags
- Read-only thread sharing with entitlement-checked Team visibility
- Cost-preview component wired to `src/lib/ai/budget`; `approval` node + autonomy enum scaffolding

**6 months**
- Signed policy plane, then desktop stdio bridge with `.mcpb` allowlist (closes ADR-0010) + `asafe://` handoff and `asafe://agent/run` deep links
- **Role packs v1 for Sales + Manufacturing Ops** (pulled forward as the change-management lever); Projects with project-scoped KB
- Agent/workflow revision history + admin approval gate; per-tool connector masks
- Policy floors + budget hard-stop enforcement; egress allowlists; chaos-test pod kills in EKS staging before Routines GA
- First non-engineering hero routine ships (pipeline digest)

**12 months**
- ElectricSQL read-path sync (Runs rail, badges), then live shared sessions
- Live Artifacts bound to refresh workflows (ERP/line-KPI dashboards); KB diff-review screen GA
- Best-of-N + Verify node feeding the Quality admin page
- Webhook-triggered event agents (Jira/ServiceNow) with act/ask-human/skip triage policy
- Per-tool MCP entitlements per team; OTel traces on runs

**Cut-line discipline:** under schedule pressure, drop ElectricSQL or the desktop bridge — the twin infrastructure-heavy, demo-poor time-sinks — **before** cutting the Compliance API or role packs. Snapshots before sync; allowlist before bridge.

## Top 3 risks

1. **Adoption stall outside engineering** — frontline staff won't configure agents or touch node graphs. Mitigate: role packs and Auto-routing make day-one value zero-config; ship Sales + Ops packs before platform sophistication; one polished non-engineering hero routine per quarter; track weekly active per department.
2. **Autonomy outruns governance** — scheduled runs with MCP tools are an exfiltration/GDPR liability until egress allowlists, policy floors, and agent-attributed audit land. Every autonomy feature is gated on its governance floor, disabled by default, enabled per-team after review; the kill switch covers background runs day one and is the backstop, not the plan. Same rule on desktop: policy plane before bridge, enforced in-process.
3. **Postgres wearing four hats + "state outlives compute" as slogan** — queue, vectors, OLTP, and Electric replication on one database, with runs not persisted today. Mitigate: dedicated worker Deployment with its own pool and statement timeouts, early partitioning of `agent_session`/audit, load-testing before Routines GA, step-row checkpointing chaos-tested with pod kills in EKS staging.

## Inspiration map

| Feature | Inspired by |
|---|---|
| Runs rail / mission control, archive-vs-delete | GitHub Agent HQ + Claude Code `/tasks` |
| `/runs/[id]` transcript URLs injected into outputs | Claude Code `CLAUDE_CODE_REMOTE_SESSION_ID` linkback |
| `actorType` agent-attributed audit | GitHub Agent HQ `actor_is_agent` |
| Role packs | Claude Plugins |
| Live Artifacts with refresh workflows | Claude Desktop artifacts |
| Desktop allowlist policy plane, `.mcpb`, no sideloading | Claude Desktop extension allowlist |
| Teleport/handoff chips | Claude Code "Continue in..." |
| "My Work" tray supervision | GitHub Copilot desktop app |
| Plan-then-approve `approval` node | GitHub Plan Mode |
| Autonomy enum + ask/act trust dial | Claude Cowork + Agent HQ modes |
| Routines + Triage inbox auto-archive | Claude Routines + Codex Automations |
| Best-of-N picker | Codex `--attempts` |
| Verify node, severity-capped P0/P1 | Codex review philosophy |
| Policy floors | Codex `requirements.toml` |
| Runtime permission escalation | Codex `request_permissions` |
| Egress allowlist levels + DNS audit | Claude network access levels |
| Per-user OAuth connectors, per-session masks | Claude Connectors |
| Projects as memory/scope boundary | Claude Projects |
| KB diff-review screen | Codex chunk-staging |
| Compliance API | Claude 2026 enterprise Compliance API |
| Entitlement-checked thread sharing | Claude session sharing / repo-access verification |

## Decision log

1. **Session is the unit of value, persisted in Postgres with checkpointed steps** — auditability, budgets, and resilience all hang off `agent_session`; chaos-tested so the property is real.
2. **Governance before autonomy, GitHub-style** — every autonomy feature is gated on its floor (hard-stops, kill switch, egress, audit attribution); the Compliance API ships in 90 days to earn IT sign-off first.
3. **One entitlement resolver for everything** — models, autonomy, tools, and desktop policy all resolve org→team→user through the existing layering; no parallel permission systems.
4. **Adoption beats sophistication** — role packs, `/schedule`, and a quarterly non-engineering hero routine ship before Electric or the bridge; weekly-active-per-department is the metric leadership watches.
5. **Cut Electric/desktop-bridge before Compliance API/role packs** — the explicit de-risking rule: infrastructure time-sinks are sacrificed before the features that fund and spread the platform.
