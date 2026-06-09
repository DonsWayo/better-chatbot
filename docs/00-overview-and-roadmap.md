# 00 — Overview & Roadmap

## Vision

A single internal AI assistant that every A Safe Digital employee (~800 people) uses daily — on the web and on the desktop — that is connected to company systems, grounded in company knowledge, routes each request to the right model automatically, and is governed centrally so spend is predictable and visible. Self-hosted on A Safe's AWS infrastructure; built by forking `cgoinglove/better-chatbot` (MIT) and adding the layers it lacks.

## Goals (outcomes, not outputs)

1. **Replace shadow AI use.** ≥70% of active employees use the internal tool weekly within 90 days of GA, so company data stops flowing into public consumer chatbots.
2. **Predictable, attributable spend.** 100% of inference spend is attributed to a team and a user; every team has an enforceable monthly budget; finance can see spend without asking engineering.
3. **Right model, right task.** Routing reduces blended cost-per-message versus a naive "everything to a frontier model" baseline, with no measurable quality regression on a fixed eval set.
4. **Connected and grounded.** Employees can use approved company MCP tools and get answers grounded in approved company knowledge, with citations.
5. **Self-serve transparency.** Every employee can see their own usage and remaining team budget without filing a ticket.

## Non-goals (explicitly out of scope)

- **Rebuilding any capability better-chatbot already has** (chat, MCP, workflows, agents, auth scaffolding). We extend; we do not rewrite.
- **Per-person fine-tuned models.** Personalization is context (profile + RAG), not training. Fine-tuned/served models are a *later, separate* initiative behind the OpenAI-compatible seam — not in this roadmap.
- **A public-facing or customer-facing product.** Internal only.
- **Switching off Postgres/Redis/S3 for exotic stores.** Reuse existing AWS infra.
- **Multi-cloud / on-device inference for v1.** Hosted providers via OpenRouter (posture confirmed with Security in Wave 4).

## Architecture at a glance

```
            ┌──────────────────────────────────────────────┐
  Web (PWA) │  Next.js 16 app (forked better-chatbot)        │
  Desktop   │  React 19 + AI SDK v5 UI + shadcn/Radix        │
  (Tauri) ──┤  Better Auth (SSO) · admin · teams · usage UI  │
            └───────────────┬──────────────────────────────┘
                            │ chat route (streamText seam)
              ┌─────────────▼─────────────┐
              │  OUR LAYER (added)         │
              │  • task-aware routing      │
              │  • budget guard (per team) │
              │  • usage metering          │
              │  • compression middleware  │
              └─────────────┬─────────────┘
                            │
                    ┌───────▼────────┐     ┌──────────────┐
                    │   OpenRouter    │     │ Company MCP   │
                    │ (model transport)│    │ servers/tools │
                    └───────┬────────┘     └──────────────┘
       providers: OpenAI/Anthropic/Google/xAI/… (+ Ollama, + future fine-tuned vLLM)

  Data: Postgres (Drizzle) · Redis (cache/sessions) · S3 (files) · pgvector (RAG, added in Wave 6)
  Ops:  AWS EKS · Prometheus/Grafana · Sentry
```

## Roadmap & the MVP cut line

| Wave | Title | Ships | Phase |
|---|---|---|---|
| 1 | Foundation & Fork | Working internal chatbot on **Vercel + Neon**, OpenRouter, pilot-team login | **MVP** |
| 2 | Intelligent Routing | Task-aware model selection through OpenRouter | **MVP** |
| 3 | Teams, Budgets & Usage | Per-team budgets enforced + per-user self-serve usage view | **MVP — cut line** |
| 4 | Identity & Admin | SSO (Microsoft/Google), teams/roles, per-team model allow-lists | GA path |
| 5 | Company MCP & Tools | Curated company MCP registry + agent identity + per-team tool access | GA path |
| 6 | Company Knowledge (RAG) | pgvector on Neon + ingest + retrieval with citations | GA path |
| 7 | Security, Safety & Guardrails | DLP/PII redaction, prompt-injection defenses, per-team guardrails | **GA gate** |
| 8 | Compliance, Audit & Lifecycle | Audit log, retention, GDPR + EU AI Act posture, SCIM lifecycle | **GA gate** |
| 9 | Productivity & Collaboration | Prompt library, shared agents, feedback, Spanish/i18n, profiles | GA path |
| 10 | Desktop | Tauri shell wrapping the web app (web/desktop parity) | GA path (optional for web GA) |
| 11 | Compression & Performance | Compression middleware + caching → lower cost-per-message | GA path |
| 12 | Production, Observability & Rollout | Hosting decision (Vercel+Neon vs. EKS), SLOs, sign-off, 800-person GA | GA |

**Cut line:** at the end of Wave 3 we have a genuinely useful, cost-governed assistant we can put in front of a pilot team. Nothing in Waves 1–3 depends on later waves. **Two later waves are GA gates, not optional:** Wave 7 (security/guardrails) and Wave 8 (compliance/GDPR/EU AI Act) — the pilot can run without them, but we do **not** roll out to the whole company until both pass, because A Safe is an EU employer-deployer. Phasing means *sequencing*, not omission: every capability is in the plan.

**Hosting:** first deploy is **Vercel + Neon (EU region) + Vercel Blob** — the easy path and upstream's default. Neon supports pgvector natively, so RAG (Wave 6) needs no separate vector DB. Whether to migrate the app to A Safe's EKS for GA is decided in Wave 12; because it's standard Postgres, Neon → AWS RDS/Aurora (both support pgvector) is a clean migration with no schema rewrite.

## Success metrics

- **Leading:** weekly active users among the pilot; median time-to-first-message; % requests routed to a non-frontier model without quality flags; % spend attributed to a team.
- **Lagging:** blended cost-per-message vs. baseline; weekly active among all 800 at GA+90d; support tickets about "which AI can I use"; budget overruns prevented.

## Glossary

- **Routing layer** — our code at the `getModel`/`streamText` seam that chooses the model and meters/guards the request.
- **Budget** — an enforceable monthly spend cap scoped to a team.
- **Usage** — per-user, per-request token + cost accounting, surfaced to the user and to admins.
- **Company MCP** — MCP servers vetted and registered centrally for org use, authenticated by the agent identity.
- **Archive vs. RAG** — upstream "archive" = collections (kept); "RAG" = our new pgvector semantic retrieval (Wave 6).
