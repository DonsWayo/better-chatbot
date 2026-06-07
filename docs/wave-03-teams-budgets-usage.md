# Wave 3 — Teams, Budgets & Usage (MVP cut line)

**Goal:** Introduce teams, enforce a monthly spend budget per team, meter every request's token + cost usage per user, and give each user a self-serve view of their usage and remaining team budget — plus an admin spend dashboard.
**Ships:** The cost-governance and transparency features that make this safe to expand. **This is the MVP cut line.**
**Depends on:** Waves 1–2 (routing emits the model/usage signal we meter).
**Phase:** MVP.

## Scope

**In scope**
- **Data model:** `team`, `team_member` (user↔team, with a role in team), `usage_event` (per request: user, team, model, input/output tokens, computed cost, timestamp, task class, thread ref), `team_budget` (team, period, limit, spent, currency).
- **Metering:** capture token usage from the AI SDK stream result on every chat request; compute cost from a maintained price table per model; write a `usage_event`.
- **Budget enforcement:** before/at request time, check the team's remaining budget; soft-warn near threshold, hard-block (with a clear message) when exceeded, per policy.
- **User self-serve view:** a page where any user sees their own usage (by day/model/cost) and their team's remaining budget.
- **Admin dashboard:** spend by team and by user, top models, trend; export to CSV.
- **Price table:** a maintainable mapping of model → input/output price; admin-editable or config-driven.

**Out of scope (this wave)**
- SSO and per-team *model allow-lists* (Wave 4). Org-wide auto team-assignment (Wave 4 via SSO claims) — Wave 3 assigns teams manually/seed.
- Compression (Wave 8). Cross-team chargeback/billing exports beyond CSV.

## Tasks

- [ ] Add `team`, `team_member`, `usage_event`, `team_budget` tables to `src/lib/db/pg/schema.pg.ts`; generate + run migrations.
- [ ] Seed: create initial teams and assign pilot users (manual until Wave 4 SSO).
- [ ] Implement a price table (model → input/output cost) with a single source of truth; document how to update it.
- [ ] In the chat route, after the stream completes, read usage from the AI SDK result and write a `usage_event` (user, team, model, tokens, cost, task class).
- [ ] Implement budget check middleware at the request path: compute team spend for the period; warn at a configurable threshold; block past the limit with a clear, friendly message and who to contact.
- [ ] Build the user usage page (own usage + team remaining budget) using SWR + existing UI components.
- [ ] Build the admin spend dashboard (by team/user/model, trend, CSV export) under the existing admin area.
- [ ] Emit budget/usage metrics to Prometheus; alert when a team crosses threshold.
- [ ] Tests: metering writes correct events; budget block triggers at the limit; usage page shows accurate per-user totals; e2e for the block path.

## Acceptance criteria

- [ ] Given any chat request, when it completes, then a `usage_event` with correct tokens and computed cost is recorded against the user and their team.
- [ ] Given a team at/over budget, when a member sends a request, then it is blocked with a clear message (and warned beforehand at the threshold).
- [ ] Given a logged-in user, when they open their usage page, then they see their own usage and their team's remaining budget — without admin help.
- [ ] Given an admin, when they open the dashboard, then they see spend by team/user/model with CSV export.
- [ ] Totals on the dashboard reconcile with summed `usage_event`s; `pnpm check && pnpm test` green; e2e green.

## Deferred to later waves

- Auto team assignment from SSO claims (Wave 4), per-team model allow-lists (Wave 4), compression-driven cost reduction (Wave 8).

## Open questions

- [Finance/Product] Budget policy: hard block, soft warn-only, or block-with-admin-override? Reset cadence (calendar month?) and currency?
- [Product] Threshold for the soft warning (e.g. 80%)? Who is the "contact" when blocked?
- [Eng] Cost source of truth: maintain our own price table, or read OpenRouter's reported costs where available?

---
*End of MVP. Do not begin Wave 4 until a pilot is live on Waves 1–3 and the above criteria pass.*
