# Wave 1 — Foundation & Fork

**Goal:** Stand up forked `better-chatbot` as `asafe-ai`, self-hosted on our infra, talking to models through OpenRouter, with a minimal A Safe identity, usable by a small pilot group.
**Ships:** A working internal chatbot a pilot team can log into and use.
**Depends on:** nothing.
**Phase:** MVP.

## Scope

**In scope**
- Fork/clone the repo, get it building and running locally and in a staging environment.
- Postgres + Redis + S3 (or Vercel Blob locally) wired via env.
- OpenRouter configured as the default inference path; a curated short list of models exposed.
- Minimal rebrand (name, logo, app title, theme color) — no deep UI surgery.
- Email/password auth working for a handful of pilot accounts (full SSO is Wave 4).
- **First deploy target: Vercel + Neon Postgres (EU region) + Vercel Blob** — the easy path, and exactly what better-chatbot's upstream assumes (one-click deploy). EKS is deferred to Wave 12; just stub the manifests now.
- Baseline observability: app logs to our stack; health endpoint.

**Out of scope (this wave)**
- Intelligent routing (Wave 2), budgets/usage (Wave 3), SSO (Wave 4), company MCP curation (Wave 5), RAG (Wave 6), desktop (Wave 7), compression (Wave 8).
- Removing features we're not using yet — leave them; just don't expose what isn't ready.

## Tasks

- [ ] Clone `cgoinglove/better-chatbot`; create the `asafe-ai` repo; retain upstream LICENSE + attribution.
- [ ] Record the upstream commit SHA we forked from (for future upstream merges).
- [ ] `pnpm install`; resolve any version pins; confirm `pnpm dev` boots.
- [ ] Provision **Neon Postgres in an EU region** (GDPR — see Wave 8); run `pnpm db:migrate`; confirm schema applies cleanly. (pgvector gets enabled later in Wave 6.)
- [ ] Point Redis via env; confirm sessions/cache work.
- [ ] Configure storage (**Vercel Blob** for the first deploy; S3 acceptable, used later if migrating to EKS).
- [ ] Set `OPENROUTER_API_KEY`; confirm chat works end-to-end against an OpenRouter model.
- [ ] Trim the exposed model list in `src/lib/ai/models.ts` to an approved short list (e.g. a frontier, a mid, a cheap, all via OpenRouter); disable providers we won't use yet.
- [ ] Minimal rebrand: app name/title, favicon/logo, primary theme color, login copy.
- [ ] Create 3–5 pilot accounts (email/password) for internal testers.
- [ ] Define the deploy: **Vercel project + Neon + Vercel Blob, one-click / Git deploy**; document env + deploy steps. (Keep the Docker/compose path for local dev and a future EKS option.)
- [ ] Stub EKS manifests/Helm values (not deployed yet) so Wave 12 has a starting point if we migrate off Vercel.
- [ ] Wire app logs + a `/health` (or existing health) endpoint into our monitoring; add a Sentry DSN.
- [ ] Update `.env.example` with every var we set.
- [ ] Smoke e2e (Playwright): login → send message → receive streamed response → reload → history persists.

## Acceptance criteria

- [ ] Given a pilot account, when a user logs in and sends a message, then they receive a streamed answer from an OpenRouter-served model.
- [ ] Given a sent conversation, when the user reloads, then the thread and messages persist (Postgres).
- [ ] Given staging, when the app is deployed via the documented method, then it runs against managed Postgres/Redis/S3 with no local-only assumptions.
- [ ] Only the approved model short list is selectable in the UI.
- [ ] `pnpm check && pnpm test` green; the smoke e2e passes.
- [ ] App health and errors are visible in our monitoring/Sentry.

## Deferred to later waves

- Routing logic, budgets, usage UI, SSO, company MCP, RAG, desktop, compression, full EKS rollout.

## Open questions

- [IT] Neon plan + EU region choice; Redis provider (Vercel/Upstash vs. existing); confirm Vercel is acceptable for the pilot (final hosting decided in Wave 12).
- [Security] Is OpenRouter acceptable for the pilot, or must the pilot use a direct provider from day one? (Final posture decided in Wave 4.)
- [Product] Which team is the pilot, and what's the approved model short list?
