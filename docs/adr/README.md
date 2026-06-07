# Architecture Decision Records — asafe-ai

This directory records the **architecturally significant, hard-to-reverse** decisions for
A Safe Digital's internal AI platform (`asafe-ai`), a fork of
[`cgoinglove/better-chatbot`](https://github.com/cgoinglove/better-chatbot) (MIT).

These ADRs were authored **before** Wave 1 code, on purpose: the biggest risk in the 12-wave
roadmap is not the code, it is making a foundational choice in an early wave that forces a
schema or architecture rewrite in a later one. Each ADR resolves one such choice.

> **Status of this set:** mostly **Proposed**; **0005 (SSO)** and **0006 (hosting)** are
> **Accepted** per A Safe's direction (Microsoft Entra SSO; **EKS-first** deploy, with
> docker-compose kept for local dev). The rest carry a recommendation but encode decisions that
> belong to Security, IT, Finance, or Legal/DPO. Each ADR names its deciders and lists the inputs
> still needed. Mark an ADR **Accepted** once its deciders sign off; don't start the gated wave
> until then.

## Index

| ADR | Decision | Gates | Deciders | Status |
|-----|----------|-------|----------|--------|
| [0000](0000-record-architecture-decisions.md) | Use ADRs; format & lifecycle | — | Eng | Accepted |
| [0001](0001-inference-posture-and-transport.md) | Inference posture & model transport (OpenRouter vs direct) | W1, W2, W4, W7 | Security, Eng | Proposed |
| [0002](0002-team-and-tenancy-model.md) | Team & tenancy data model (custom tables vs Better Auth org plugin) | W3–W9 | Eng, Product | Proposed |
| [0003](0003-budget-enforcement-and-cost-accounting.md) | Budget enforcement & cost accounting | W3 (cut line) | Finance, Product, Eng | Proposed |
| [0004](0004-intelligent-routing.md) | Intelligent routing design | W2 | Product, Eng | Proposed |
| [0005](0005-enterprise-sso-and-identity-lifecycle.md) | Enterprise SSO + identity lifecycle (Microsoft Entra OIDC + SCIM) | W4, W8 | IT, Security | **Accepted** |
| [0006](0006-hosting-and-data-residency.md) | Hosting & EU data residency — **EKS-first** (docker-compose local) | W1, W8, W12 | IT, Security, Eng | **Accepted** |
| [0007](0007-rag-pgvector-architecture.md) | RAG / pgvector architecture (embedding model & dimension) | W6 | Eng, Legal | Proposed |
| [0008](0008-guardrails-and-dlp-placement.md) | Guardrails & DLP placement | W7 (GA gate) | Security, Eng | Proposed |

## Decisions deliberately deferred (not yet ADRs)

These are real choices, but deferring them is low-risk because they do not touch the schema or
the core request path. They get an ADR when their wave begins.

- **Compression engine** — TS reimplementation vs. `headroom` Python sidecar (Wave 11).
- **Routing classifier tier** — when/whether to enable the LLM-classifier behind the flag from
  ADR-0004 (Wave 2 ships rules-only).
- **Desktop packaging** — Tauri shell in-repo vs. sibling repo; system-browser vs. embedded SSO
  (Wave 10).
- **Self-hosted embeddings** — moving off a hosted embedding model to e.g. `bge-m3` on vLLM
  (post-GA; ADR-0007 keeps the door open).

## Conventions

- One decision per file, numbered `NNNN-kebab-title.md`, never renumbered.
- Format defined in [ADR-0000](0000-record-architecture-decisions.md).
- A superseded ADR stays in the tree with status **Superseded by ADR-XXXX** — we keep the history.
- ADRs reference real code seams by `file:line` so they are actionable, not abstract.

## Key verified code seams (the integration points these ADRs build on)

| Seam | Location | Used by |
|------|----------|---------|
| Model resolution | `src/app/api/chat/route.ts:78` (`customModelProvider.getModel`) | ADR-0001, 0004 |
| Stream / model wrap | `src/app/api/chat/route.ts:318` (`streamText`; session in scope → `wrapLanguageModel`) | ADR-0003, 0008, 0011(compression) |
| Model registry | `src/lib/ai/models.ts` (`staticModels`, `createOpenAICompatibleModels`) | ADR-0001, 0004 |
| Schema (single file) | `src/lib/db/pg/schema.pg.ts` (19 tables) | ADR-0002, 0003, 0007 |
| Auth | `src/lib/auth/{config,auth-instance}.ts`; user-create hook ~L59–82 | ADR-0005 |
| Permissions / roles AC | `src/lib/auth/{permissions,roles}.ts` (admin/editor/user) | ADR-0002, 0005 |
| MCP subsystem | `src/lib/ai/mcp/` (DB config storage, PG OAuth) | (Wave 5) |
| Storage / ingest | `src/lib/file-storage/` (Blob↔S3), `src/lib/file-ingest/` (CSV today) | ADR-0007 |
