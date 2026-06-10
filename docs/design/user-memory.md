# User Memory — design (research-backed)

> Goal (Juan, 2026-06-10): "remember the user decisions as well" — the assistant
> retains user decisions, preferences, corrections and working context across
> conversations. Grounded in a deep-research pass over ChatGPT memory (incl. the
> April-2025 chat-history layer and 2026 "dreaming"), Claude.ai memory
> (Sept–Oct 2025), and their enterprise controls. All product-behavior claims
> below were adversarially verified against vendor primary docs.

## What both market leaders converged on (the template)

1. **Dual-path capture** — explicit "remember this" + model-managed implicit
   extraction in the background. Implicit is gated behind explicit (ChatGPT:
   disabling saved memories also disables chat-history referencing).
2. **Synthesized, always-injected context** — neither vendor replays raw
   transcripts; a curated artifact is injected into every chat.
3. **User-visible manager** — "Memory updated" toast in-chat; a settings page
   with per-item (ChatGPT) or summary-level (Claude) view/edit/delete +
   clear-all. ChatGPT Projects' *missing* memory list is the documented
   anti-pattern to avoid.
4. **Memories decoupled from chats** — deleting a conversation does NOT delete
   derived memories; erasure must target the memory store directly (GDPR
   right-to-erasure design consequence).
5. **Temporary/incognito chats neither read nor write memory.**
6. **Enterprise controls are baseline**: org-wide admin kill switch that
   cascades, per-user opt-out, audit-logged toggles, ≤30-day deletion SLA,
   extractor steered away from sensitive (Art. 9-like) data. Notably OpenAI
   still withholds *implicit* chat-history memory from Enterprise/Edu entirely
   — a strong signal to keep our implicit layer conservative and clearly
   policy-gated.
7. **Pause vs reset** (Claude): pause keeps but stops using/creating; reset is
   permanent deletion. Claude's org-disable *deletes* all memory data.

## Our architecture (asafe-ai v1)

**Typed memory rows** (ChatGPT-style discrete facts) rather than Claude's
single regenerated summary: we already run pgvector, and per-row storage gives
per-item GDPR erasure, per-item user control, and supersede chains. A compact
injection block keeps the cost Claude-summary-like.

### Storage — `user_memory` (migration 0042)

| column | type | notes |
|---|---|---|
| id | uuid pk | |
| user_id | uuid → user, cascade | memories are strictly per-user (vendor precedent) |
| scope_id | text null | null = global; `agent:<id>` / `folder:<id>` namespaces later (Claude per-project scoping precedent) |
| kind | varchar enum | `preference` \| `decision` \| `profile` \| `project_context` |
| content | text | one fact, ≤ ~300 chars target |
| embedding | vector(1536) null | embedded async; reuses the knowledge-stack embedder |
| source_thread_id | uuid null, no FK | provenance; thread deletion must NOT cascade (decoupling) |
| confidence | real | 1.0 for explicit "remember this"; extractor estimate otherwise |
| superseded_by | uuid null self-ref | conflict resolution = supersede, never silent overwrite |
| created_at / last_used_at | timestamp | recency + usage ranking; staleness review |

Hard delete on user erasure (no soft delete), and memories ride the GDPR
export in Data controls.

### Extraction (write path)

- **Async post-turn**: fire-and-forget after the chat stream finishes —
  never blocks the response. Small/cheap model from the existing registry.
- **Explicit** asks ("remember that…") stored with confidence 1.0; extractor
  also emits `supersedes` references when a new fact contradicts an old one.
- **Skipped entirely** when: temporary chat, user memory mode ≠ on, or
  org/team policy disables memory.
- Extractor prompt steers away from special-category data (health, beliefs,
  etc.) unless the user explicitly asks — vendor practice and Art. 9 hygiene.

### Injection (read path)

Token-budgeted `<user_memory>` block assembled into the system prompt at chat
start (both vendors inject persistently rather than relying on a tool call):
non-superseded rows ranked by recency + `last_used_at` + vector similarity to
the current message, capped (~800 tokens). `last_used_at` bumped async.

### User controls (Settings → Personalization)

- Tri-state: **on / paused / off** — paused = keep but neither read nor write
  (Claude's pause); turning off offers **reset** = permanent delete (clear-all).
- Memory manager list: per-item view + delete, clear-all, kind filter.
- In-chat **"Memory updated"** toast linking to the manager.
- Temporary chat (existing feature) excluded automatically.

### Admin policy

- `memory_enabled` as a layered org→team policy in `asafe_org_settings`
  (same resolution pattern as autonomy + model policy). Cascade wins over user
  preference; toggle changes audit-logged. Org-level disable stops read+write
  immediately (we keep data unless the admin chooses purge — softer than
  Claude's delete-on-disable, and reversible; purge is an explicit second action).

### Open questions (flagged by research)

- Lawful-basis analysis for *implicit* extraction in an EU employment context
  is inferred from vendor practice, not legal review — keep implicit extraction
  policy-gated OFF by default at org level until A-SAFE legal signs off;
  explicit "remember this" is the safe default-on path.
- mem0/Zep/LangMem APIs were not verifiably documented in the research pass;
  we build in-house on Postgres+pgvector (fits the fork rule anyway).
