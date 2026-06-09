# Wave 9 — Productivity & Collaboration

**Goal:** Make the assistant something people *want* to use daily: shared prompt library, shared agents/personas catalog, response feedback, multimodal exposure, Spanish + English UI, and lightweight per-user personalization.
**Ships:** Adoption-driving surface that turns a chatbot into a team tool.
**Depends on:** Waves 1–6 (teams, agents, MCP, RAG exist to share/personalize around).
**Phase:** GA path.

## Scope

**In scope**
- **Shared prompt library:** users and teams save, organize, and share prompt templates; org-curated featured prompts.
- **Shared agents & personas catalog:** publish/share the agents better-chatbot already supports; org-curated catalog with per-team visibility (ties to Wave 4/5 access).
- **Response feedback:** thumbs up/down + optional comment on answers; feedback stored for the quality loop (Wave 12).
- **Multimodal exposure:** surface the upstream image-gen, vision, and speech (TTS/STT, realtime voice) capabilities behind per-team policy/allow-lists.
- **Localization:** ship **Spanish and English** UI (A Safe is Spain-based); leverage upstream `next-intl`; make ES first-class, not an afterthought.
- **Personalization (lightweight):** per-user profile (role, team, preferences) used as context — *context, not fine-tuning*. Optional, privacy-respecting, user-editable.

**Out of scope (this wave)**
- Per-person fine-tuned models (not in this roadmap). A full org "digital twin"/knowledge graph (revisit post-GA if there's demand). Mobile apps.

## Tasks

- [ ] Build the prompt library: save/organize/share templates; team and org scopes; featured set curated by admins.
- [ ] Build the shared agents/personas catalog on top of upstream agents; per-team visibility; publish/clone flow.
- [ ] Add response feedback (thumbs + optional comment); persist with the message/usage record for later analysis.
- [ ] Expose multimodal features (image-gen, vision, speech) behind per-team policy/allow-lists; respect guardrails (Wave 7).
- [ ] Complete Spanish localization of the UI via `next-intl`; verify ES/EN parity; default language from user/IdP locale.
- [ ] Add an editable per-user profile injected as context per policy; make it transparent and opt-out-able.
- [ ] Tests: a shared prompt/agent is visible only to permitted teams; feedback persists; ES UI renders fully; profile context is applied and can be disabled.

## Acceptance criteria

- [ ] Given a saved/shared prompt or agent, when a permitted teammate opens the catalog, then they can use it; non-permitted teams cannot see it.
- [ ] Given an answer, when a user rates it, then the rating (and any comment) is stored against that message.
- [ ] Given a Spanish-preferring user, when they use the app, then the UI is fully in Spanish with no missing strings.
- [ ] Given a user profile, when enabled, then it informs responses as context; when disabled, it is not used.
- [ ] Multimodal features appear only for teams allowed them; `pnpm check && pnpm test` green; e2e green.

## Open questions

- [Product] Which prompts/agents are org-curated "featured" at launch?
- [Product] Default personalization on or off? What profile fields, and how surfaced/edited?
- [Security] Multimodal allow-list defaults (image-gen/voice) per team.
