# CLAUDE.md — A Safe AI (internal AI platform)

> Operating manual for Claude Code. Read this first, every session, before touching any wave file.

## What we are building

A Safe Digital's internal AI assistant for ~800 employees: a self-hosted, web **and** desktop chat platform with intelligent model routing, per-team budgets, self-serve usage visibility, company MCP servers/tools, and company-knowledge RAG. Single sign-on, centrally administered, running on our own AWS infrastructure.

**Working name:** `asafe-ai` (placeholder — rename freely).

## The single most important rule: we FORK, we do not REBUILD

The base is **`cgoinglove/better-chatbot`** (MIT). We clone it and build on top. We do **not** rewrite it, and we do **not** reimplement things it already does well. The reasons it was chosen:

- Exact target stack: **Next.js 16, React 19, AI SDK v5, Drizzle ORM + Postgres, TypeScript** end to end.
- **MIT licensed** — we can modify, rebrand, and deploy internally without restriction.
- Already wired: **OpenRouter** + **Ollama** + dynamic **OpenAI-compatible** providers; first-class **MCP** (with OAuth); visual **workflows** (React Flow); **agents**; code execution; image/speech; **Better Auth** with Google/GitHub/Microsoft social login; a `role` field + admin plugin + admin UI; Vercel Blob **or** S3 storage; Redis; i18n; Vitest + Playwright; Docker Compose.

**What better-chatbot already gives us (do NOT rebuild):** chat threads/messages, the AI SDK v5 streaming loop, MCP client manager + OAuth, workflows, agents, auth scaffolding, file upload/storage, the base admin/roles, i18n, the test harness.

**What it does NOT have (these are OUR work, and they are the point):**
1. Intelligent/task-aware model routing (it's user-picks-from-dropdown).
2. Per-team budgets + per-user usage accounting/dashboards (no balance/transaction tables exist).
3. Vector RAG / semantic company knowledge (the "archive" is collections, not embeddings — there is zero pgvector in the codebase).
4. Enterprise SSO posture beyond social OAuth, and granular per-team admin.
5. Context compression.
6. A desktop client.
7. Security guardrails / DLP / PII redaction / prompt-injection defenses.
8. Compliance: audit logging, retention, GDPR + EU AI Act deployer obligations, identity lifecycle (SCIM).
9. A productivity surface (shared prompt library, shared agents, feedback, Spanish/i18n).

The waves add exactly these, at the seams identified below.

## Known integration seams (verified against the codebase)

- **Model resolution / routing →** `src/app/api/chat/route.ts` ~line 78: `customModelProvider.getModel(chatModel)`. Intercept here for task-aware routing. The registry lives in `src/lib/ai/models.ts` (`staticModels`, plus `createOpenAICompatibleModels`). Register our routing service as an OpenAI-compatible provider here if we route externally.
- **Compression + budget enforcement →** the `streamText({ model, system, messages, tools, stopWhen: stepCountIs(10) })` call in `src/app/api/chat/route.ts` (~line 318). Wrap the model with the AI SDK `wrapLanguageModel({ model, middleware })`. The authenticated user/session is already in scope in this route.
- **Schema →** `src/lib/db/pg/schema.pg.ts` (single Drizzle schema file, 19 tables). New tables (teams, budgets, usage, embeddings) go here; migrations via `pnpm db:generate` then `pnpm db:migrate`.
- **Auth →** `src/lib/auth/auth-instance.ts` and `src/lib/auth/config.ts` (Better Auth; social providers gated by env). SSO work happens here.
- **MCP →** `src/lib/ai/mcp/` (client manager, OAuth provider, config storage backends). Company MCP registry builds on this.
- **Storage / ingest →** `src/app/api/storage/` and `src/lib/file-ingest/`, `src/lib/ai/ingest/`. RAG ingestion hooks here.

## Stack conventions (match the existing repo — do not introduce new tooling)

- Language: **TypeScript**, strict. Lint/format: **Biome** (`pnpm lint:fix`, `pnpm format`). Types: `pnpm check-types`.
- DB: **Drizzle + Postgres**. All schema changes in `schema.pg.ts`; never hand-edit migrations. `pnpm db:generate` / `pnpm db:migrate` / `pnpm db:studio`.
- State: **Zustand**; data fetching: **SWR**. UI: **shadcn/Radix + Tailwind v4**. Do not add a second UI kit.
- Tests: **Vitest** (unit) + **Playwright** (e2e). Every wave ships with tests. `pnpm test`, `pnpm test:e2e`.
- Validation: **Zod v4**. Keep request/response schemas in `app-types/`.
- Models/providers via **AI SDK v5** only. Inference reaches providers through **OpenRouter** by default.

## Guardrails

- **Stay close to upstream.** Prefer additive modules over editing core files, so we can pull upstream updates. When you must edit a core file, keep the diff minimal and comment why.
- **MIT compliance:** retain the upstream LICENSE/attribution. Our additions are ours.
- **No secrets in code.** All keys via env (`.env.example` is the contract). Never log tokens, prompts with PII, or keys.
- **First deploy = Vercel + Neon Postgres (EU region) + Vercel Blob** (the easy path; upstream's default). Neon supports pgvector natively, so RAG (Wave 6) needs no separate vector DB. Whether to migrate the app to our EKS for GA is decided in **Wave 12** — do not pre-migrate. No other new infra without a wave saying so.
- **Observability:** emit to our existing **Prometheus/Grafana** and **Sentry**. Do not add a competing stack.
- **Privacy:** company chat data must not transit third parties beyond the chosen inference path. Provider posture (direct vs OpenRouter) is set in Wave 4 / confirmed with Security before GA.

## Ship discipline (read this twice)

This plan is comprehensive on purpose, but it is **strictly phased**. The MVP cut line is the **end of Wave 3** — a working, cost-governed internal assistant for a pilot team. Everything after is the path to 800-person GA. **Do not start a wave until the prior wave's acceptance criteria pass.** Do not pull work forward "while we're at it." If a task isn't in the current wave, it goes in that wave's Deferred list, not into the diff. **Two later waves are GA gates, not optional:** Wave 7 (security/guardrails) and Wave 8 (compliance/audit/GDPR/EU AI Act). The pilot (Waves 1–3) can run without them, but do **not** roll out company-wide until 7 and 8 pass — A Safe is an EU employer-deployer.

## Definition of done (every wave)

- [ ] All tasks checked, all acceptance criteria pass.
- [ ] `pnpm check && pnpm test` green; relevant Playwright e2e green.
- [ ] New env vars documented in `.env.example`.
- [ ] Schema changes have generated migrations committed.
- [ ] Metrics/traces emitted for new request paths.
- [ ] Short CHANGELOG entry and a one-paragraph "how to verify" in the wave file's footer.

## How to use the wave files

Execute `docs/wave-01-foundation.md` first; proceed in order. Each wave file is self-contained: Goal, Scope, Tasks (tickboxes), Acceptance criteria, Deferred, Open questions. Tick boxes as you complete them. Specs contain **no code** — you write the code; the spec defines the contract.
