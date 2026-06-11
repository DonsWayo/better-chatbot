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

- [x] Build the prompt library: save/organize/share templates; team and org scopes; featured set curated by admins. — done via asafe_prompt_template (private/team/org visibility, isFeatured, categories, usage count) + /api/prompts + prompt-library UI
- [x] Build the shared agents/personas catalog on top of upstream agents; per-team visibility; publish/clone flow. — done via the unified visibility model (docs/design/visibility-model.md: private/team/org) on agents + teamspaces/folders + role packs
- [x] Add response feedback (thumbs + optional comment); persist with the message/usage record for later analysis. — done via asafe_message_feedback (unique per user+message) + message-feedback.tsx + admin quality dashboard
- [ ] Expose multimodal features (image-gen, vision, speech) behind per-team policy/allow-lists; respect guardrails (Wave 7). — OPEN: allowImageGen/allowVision/allowSpeech team flags + admin UI + e2e exist, but only allowVision is enforced (chat route); image-gen tool and realtime-voice route do not check their flags yet
- [x] Complete Spanish localization of the UI via `next-intl`; verify ES/EN parity; default language from user/IdP locale. — done via messages/es.json at full key parity with en.json (1158/1158 keys); default locale from cookie/browser rather than IdP
- [x] Add an editable per-user profile injected as context per policy; make it transparent and opt-out-able. — done via user memory (src/lib/memory: extract/inject/policy with org→team→user opt-out cascade) + memory-manager UI + memory-updated pill
- [x] Tests: a shared prompt/agent is visible only to permitted teams; feedback persists; ES UI renders fully; profile context is applied and can be disabled. — done via tests/asafe (prompt-library*, feedback, w9-team-policy, persona-matrix, entitlement-gate) + tests/memory + memory unit tests; ES coverage via key-parity check

## Acceptance criteria

- [x] Given a saved/shared prompt or agent, when a permitted teammate opens the catalog, then they can use it; non-permitted teams cannot see it. — done via visibility-scoped queries; covered by prompt-library-full.spec.ts and persona-matrix.spec.ts
- [x] Given an answer, when a user rates it, then the rating (and any comment) is stored against that message. — done via asafe_message_feedback; covered by feedback.spec.ts
- [x] Given a Spanish-preferring user, when they use the app, then the UI is fully in Spanish with no missing strings. — verified: es.json has full key parity with en.json (1158/1158)
- [x] Given a user profile, when enabled, then it informs responses as context; when disabled, it is not used. — done via memory inject + policy cascade (policy-disabled stops read+write regardless of user setting)
- [ ] Multimodal features appear only for teams allowed them; `pnpm check && pnpm test` green; e2e green. — OPEN: unit suite green (2026-06-11), but image-gen/speech team flags are not enforced at their routes (only vision is)

## Open questions

- [Product] Which prompts/agents are org-curated "featured" at launch?
- [Product] Default personalization on or off? What profile fields, and how surfaced/edited?
- [Security] Multimodal allow-list defaults (image-gen/voice) per team.
