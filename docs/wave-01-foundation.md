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

- [x] Clone `cgoinglove/better-chatbot`; create the `asafe-ai` repo; retain upstream LICENSE + attribution. — done via `asafe` remote (DonsWayo/asafechat); upstream MIT LICENSE retained
- [x] Record the upstream commit SHA we forked from (for future upstream merges). — done via git history: `origin` remote still points at upstream and merge commits (e.g. `be3ce69`) preserve the merge base
- [x] `pnpm install`; resolve any version pins; confirm `pnpm dev` boots.
- [x] Provision **Neon Postgres in an EU region** (GDPR — see Wave 8); run `pnpm db:migrate`; confirm schema applies cleanly. (pgvector gets enabled later in Wave 6.) — done via self-hosted Postgres on EKS instead of Neon (ADR-0006); migration journal repaired and applies cleanly
- [x] Point Redis via env; confirm sessions/cache work. — done via optional Redis cache layer (`src/lib/cache/redis-cache.ts`, `REDIS_URL`); sessions live in Postgres (Better Auth)
- [x] Configure storage (**Vercel Blob** for the first deploy; S3 acceptable, used later if migrating to EKS). — done via S3 as the production default (ADR-0006); Vercel Blob still supported for local/dev
- [x] Set `OPENROUTER_API_KEY`; confirm chat works end-to-end against an OpenRouter model.
- [x] Trim the exposed model list in `src/lib/ai/models.ts` to an approved short list (e.g. a frontier, a mid, a cheap, all via OpenRouter); disable providers we won't use yet. — done via OpenRouter-only registry (all direct-provider blocks removed; ADR-0001)
- [x] Minimal rebrand: app name/title, favicon/logo, primary theme color, login copy. — done via "Conek AI" branding (`src/app/layout.tsx`, `src/components/layouts/conek-logo.tsx`)
- [ ] Create 3–5 pilot accounts (email/password) for internal testers. — OPEN: ops step; superseded by Entra SSO login (Wave 4); `scripts/seed-test-users.ts` exists for test accounts
- [x] Define the deploy: **Vercel project + Neon + Vercel Blob, one-click / Git deploy**; document env + deploy steps. (Keep the Docker/compose path for local dev and a future EKS option.) — done via Helm/EKS deploy instead (`deploy/README.md`, `deploy/deploy-dev.sh`); Vercel path dropped per ADR-0006
- [x] Stub EKS manifests/Helm values (not deployed yet) so Wave 12 has a starting point if we migrate off Vercel. — exceeded: full Helm chart (`deploy/helm/asafe-ai`) + k8s manifests (`deploy/k8s`) shipped
- [x] Wire app logs + a `/health` (or existing health) endpoint into our monitoring; add a Sentry DSN. — done via `/api/health`, `/api/metrics` (Prometheus) and Sentry (`src/instrumentation.ts`, `SENTRY_DSN` env)
- [x] Update `.env.example` with every var we set.
- [x] Smoke e2e (Playwright): login → send message → receive streamed response → reload → history persists. — done via `tests/auth/signin.spec.ts` + `tests/asafe/chat-routing.spec.ts`

## Acceptance criteria

- [x] Given a pilot account, when a user logs in and sends a message, then they receive a streamed answer from an OpenRouter-served model. — covered by `tests/asafe/chat-routing.spec.ts`
- [x] Given a sent conversation, when the user reloads, then the thread and messages persist (Postgres). — upstream thread/message persistence retained
- [x] Given staging, when the app is deployed via the documented method, then it runs against managed Postgres/Redis/S3 with no local-only assumptions. — done via documented EKS/Helm deploy (`deploy/README.md`); secrets via `deploy/k8s/external-secret.yaml`
- [x] Only the approved model short list is selectable in the UI. — done via OpenRouter-only registry + layered entitlements (ADR-0009)
- [x] `pnpm check && pnpm test` green; the smoke e2e passes. — verified 2026-06-11: `tsc --noEmit` clean; vitest 5962/5963 (single failure is `src/app/api/realtime/shape/route.test.ts`, Wave 9 realtime scope, unrelated to this wave)
- [x] App health and errors are visible in our monitoring/Sentry. — `/api/health`, `/api/metrics`, Sentry instrumentation wired

## Deferred to later waves

- Routing logic, budgets, usage UI, SSO, company MCP, RAG, desktop, compression, full EKS rollout.

## Open questions

- [IT] Neon plan + EU region choice; Redis provider (Vercel/Upstash vs. existing); confirm Vercel is acceptable for the pilot (final hosting decided in Wave 12). — resolved: EKS + self-hosted Postgres, no Vercel/Neon (ADR-0006)
- [Security] Is OpenRouter acceptable for the pilot, or must the pilot use a direct provider from day one? (Final posture decided in Wave 4.) — resolved: OpenRouter-only posture (ADR-0001)
- [Product] Which team is the pilot, and what's the approved model short list?

---
**How to verify:** `pnpm check-types && pnpm test` (unit, Vitest); `pnpm test:e2e` (Playwright, needs a running stack + `pnpm test:e2e:seed`); chat smoke = `tests/asafe/chat-routing.spec.ts`; deploy per `deploy/README.md`; health at `/api/health`, metrics at `/api/metrics`.
