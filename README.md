# asafe-ai — A Safe Digital Internal AI Platform

[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-15-000000?logo=next.js&logoColor=white)](https://nextjs.org/)
[![License: MIT fork](https://img.shields.io/badge/License-MIT%20fork-green)](./LICENSE)

Internal AI assistant platform for A Safe Digital employees (~800 users, EU/Spain). Built on a curated open-source stack, deployed on EKS, with enterprise-grade features: Microsoft Entra SSO, team budgets, company knowledge base (RAG), and a vetted MCP tool catalog.

---

## Quick Start (Local Dev)

Requires: Node.js 20+, pnpm 9+, Docker.

```bash
# 1. Clone and install
git clone <repo>
cd asafe-ai
pnpm install

# 2. Configure
cp .env.example .env
# Edit .env — minimum required: OPENROUTER_API_KEY, BETTER_AUTH_SECRET, POSTGRES_URL

# 3. Start DB (AI-native Postgres: pgvector + timescaledb)
docker compose -f docker/compose.yml up -d

# 4. Run migrations
pnpm db:migrate

# 5. Start dev server
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) to access the app.

---

## Key Features

- **Task-aware model routing** — Auto mode selects from Opus / GPT-5.1 / Gemini per task class; manual model selection also available.
- **Team & budget management** — Per-team cost caps, usage dashboard, and admin controls.
- **Microsoft Entra OIDC SSO** — Group-to-role mapping; email/password fallback disabled in production.
- **Company knowledge base** — RAG over internal documents using pgvector HNSW indexes; multilingual ES/EN support.
- **Company MCP catalog** — Vetted MCP tool integrations with per-team access controls and audit logging.
- **Response feedback & prompt library** — Thumbs up/down feedback on responses; shared prompt library for common use cases.
- **Electron desktop app** — Native wrapper with local MCP bridge (Wave 10; pending Security sign-off).
- **Observability** — Prometheus metrics exposed at `/api/metrics`.

---

## Wave Roadmap

| Wave | Scope | Status |
|------|-------|--------|
| W1 | Foundation (fork, OpenRouter-only, EKS scaffold) | Done |
| W2 | Intelligent Routing (task classification, Auto mode) | Done |
| W3 | Teams & Budgets (per-team cost caps, usage dashboard) | Done |
| W4 | Identity & Admin (Entra OIDC SSO, RBAC, admin panel) | Done |
| W5 | Company MCP Catalog (vetted tools, audit log; agent identity TBD) | Done |
| W6 | Company Knowledge / RAG (schema + API; full retrieval active) | Done |
| W7 | Security Guardrails (DLP seam ready; implementation pending Security review) | Seam ready |
| W8 | Compliance / GDPR (data export done; full GDPR audit pending) | Partial |
| W9 | Productivity (feedback, prompt library, ES i18n) | Done |
| W10 | Desktop (Electron scaffold done; local MCP bridge pending Security sign-off) | Partial |
| W11 | Context Compression (seam ready; implementation deferred — ADR-0011) | Deferred |
| W12 | Production GA (rate limiting + metrics done; GA needs Security/Legal sign-off) | Pre-GA |

---

## Architecture

- **Deployment**: EKS; Helm chart at `deploy/helm/asafe-ai/`.
- **Database**: Cloud-managed Postgres with pgvector and timescaledb extensions. Local dev uses `docker/compose.yml`.
- **Inference**: OpenRouter only — no direct provider keys in production.
- **Auth**: better-auth with Microsoft Entra OIDC plugin; group claims mapped to application roles.
- **ADRs**: Architecture Decision Records at `docs/adr/`.

---

## Upstream Attribution

Fork of [cgoinglove/better-chatbot](https://github.com/cgoinglove/better-chatbot) (MIT). See [FORK.md](./FORK.md) for divergence notes and upstream sync policy.
