# Fork provenance — asafe-ai

`asafe-ai` is A Safe Digital's internal AI platform, **forked from**
[`cgoinglove/better-chatbot`](https://github.com/cgoinglove/better-chatbot) (MIT). We **extend; we
do not rewrite.**

## Fork point

- **Upstream:** https://github.com/cgoinglove/better-chatbot
- **Forked at commit:** `c3bd64f` ("Update README.md") — upstream HEAD at fork time (2026-06-07).
- **Upstream version:** `better-chatbot` 1.26.0 (`package.json` at the fork point).

Record this SHA so future upstream merges have a known base. To pull upstream changes later:

```bash
git remote add upstream https://github.com/cgoinglove/better-chatbot.git
git fetch upstream
git merge upstream/main      # or cherry-pick; resolve against our additive modules
```

## License & attribution (MIT)

better-chatbot is MIT-licensed; we retain the upstream `LICENSE` and authorship. The asafe-ai
layers we add on top are A Safe Digital's. **Do not remove upstream copyright/attribution.**

## What we keep (do NOT rebuild)

Upstream already provides — and we keep — chat threads/messages, the AI SDK v5 streaming loop, MCP
client + OAuth, workflows, agents, Better Auth scaffolding, file upload/storage, base admin/roles,
i18n, and the Vitest + Playwright test harness.

## What we add (the point of the fork)

The 12-wave plan in [`docs/`](docs/00-overview-and-roadmap.md) and the decisions in
[`docs/adr/`](docs/adr/README.md): intelligent routing · per-team budgets + usage · vector RAG
(pgvector) · enterprise SSO (Microsoft Entra) + SCIM · context compression · desktop · security
guardrails/DLP · compliance/audit (GDPR + EU AI Act) · productivity surface (prompt library,
shared agents, Spanish).

## Key deltas from the original research spec (decided)

- **Hosting: EKS-first** (not Vercel) — local dev stays on docker-compose. See
  [ADR-0006](docs/adr/0006-hosting-and-data-residency.md).
- **SSO: Microsoft Entra ID / M365** — see
  [ADR-0005](docs/adr/0005-enterprise-sso-and-identity-lifecycle.md).
- **Inference: OpenRouter** for the pilot (posture re-decided at Wave 4 with Security) — see
  [ADR-0001](docs/adr/0001-inference-posture-and-transport.md).

## Staying close to upstream

Prefer **additive modules** over editing core files so upstream merges stay clean. When you must
touch a core file (e.g. the chat-route model/stream seam), keep the diff minimal and comment why.
Match existing stack conventions — TypeScript strict, Biome, Drizzle, Zod v4, shadcn/Radix,
Zustand + SWR — and add no new tooling. Full guidance: [`docs/CLAUDE.md`](docs/CLAUDE.md).
