# Agent Platform — Managed Agents, Workflows & Collaboration Design

> Companion to `docs/next-gen-platform-blueprint.md`. Grounded in the existing codebase
> (`src/lib/ai/workflow`, `src/lib/admin/model-policy.ts`, MCP catalog multi-team scoping).

## Unifying idea

One governance + execution layer under both conversational agents and node-graph workflows:

**Definition** (what it is) → **Revision** (immutable version) → **Session** (one governed execution) → **Steps** (checkpoints)

Chat, workflows, routines, webhooks, multiplayer threads, and opencode desktop coding sessions are all
*sessions of some revision*. One Runs drawer, one audit trail, one budget meter. This mirrors Claude
Managed Agents (agent → version → session) but is Postgres-native and team-governed.

## Data model

| Table | Purpose | Key columns |
|---|---|---|
| `folder` | Notion-style teamspace tree | parentId, teamId, visibility, name |
| `agent_revision` | Immutable version of an agent or workflow | kind (`conversational`/`workflow`), sourceId, version, configSnapshot jsonb, status (`draft`→`pending_review`→`published`→`archived`), authorId, approvedBy, changelog |
| `agent_session` | One execution | definitionId + **pinned revisionId**, teamId, userId, folderId, originSurface (web/desktop/schedule/webhook/opencode), mode (`interactive`/`plan`/`autopilot`), status, costSoFar, parentSessionId |
| `agent_step` | Checkpoint per node/turn | sessionId, nodeId, input/output jsonb, status, costUsd, timestamps |
| `approval_request` | Human gate | sessionId, stepId, payload (plan/diff), requestedOf (role), decidedBy |
| `workflow_schedule` | Routines | definitionId, pin policy (pinned vs track-latest-published), cron + tz, inputTemplate, teamId |

Invariants:
- **Sessions pin a revision** — publishing v7 never mutates an in-flight v6 run. Schedules choose pinned vs track-latest.
- **parentSessionId** = sub-agents for free; cost rolls up; Runs drawer shows the tree. Depth-capped.

## Runtime

- **Interactive (chat):** existing chat route streams. The workflow executor already emits
  NODE_START/NODE_END via `subscribe()` — wrap it to persist a step row per event. That one change
  yields transcripts, cost attribution, and resumability.
- **Detached (routines/autopilot/webhooks):** dedicated worker Deployment (Helm):
  `SELECT … FROM agent_session WHERE status='queued' FOR UPDATE SKIP LOCKED LIMIT 1`; heartbeat
  column per node; stale heartbeat → another worker reclaims, hydrates completed nodes from step
  rows, resumes. Chaos-test pod kills in staging before Routines GA.
- **Approval node:** executor writes `approval_request`, sets session `awaiting_approval`, releases
  the worker (zero compute while waiting). Approval (Server Action) re-queues; any worker resumes
  from checkpoint.
- **Live streaming & steering (no Redis):** `GET /api/runs/[id]/stream` (SSE) + Postgres
  LISTEN/NOTIFY per step. Electric later replaces only the fan-out, never the write path.
  Steer/abort = Server Action setting a control flag checked between nodes.

## NL workflow generation ("Cowork-lite")

Chat tool `generate_workflow`: model emits graph JSON constrained by a zod schema of the existing
node vocabulary → validated by `node-validate.ts` → saved as a **draft revision** in the user's
folder → React Flow builder opens → normal publish flow. Edits are visual node-patch diffs.
The model drafts; it never publishes.

## Governance

- Publish lifecycle: draft → submit → review (team-owner/admin; optional per-team auto-approve) →
  published with **multi-team scoping** (same teamIds[] combobox pattern as the MCP catalog).
  Org-wide publish = admin-only.
- Autonomy (Interactive/Plan/Autopilot) resolved via the **same org→team→user layering** as model
  entitlements (`src/lib/admin/model-policy.ts` pattern). Plan auto-injects an approval node before
  side-effecting tools. Autopilot grantable only after the team's governance floor exists
  (budget hard-stop ON, kill-switch coverage, guardrail severity cap).
- Kill switch: worker checks the existing feature flag on every claim — org-wide pause in seconds.
- Audit: session start/steps/approvals/steers logged with `actorType: human | agent`.

## Collaboration weave (Notion-style)

1. Agents/workflows/schedules live **in folders** (teamspaces). Folder membership = invoke permission;
   org catalog is the admin-curated top level.
2. **Runs are shared objects**: sessions in a shared folder are live-visible to members (read);
   steer/abort restricted to initiator + folder admins.
3. **Multiplayer agent chats**: several humans + the agent in one thread; each human message goes
   through the chat route under their own session (per-person attribution/guardrails/audit); the
   model stream fans out via LISTEN/NOTIFY now, Electric shapes later. Presence/typing same channel.
4. **Budgets**: initiator's team pays by default; folders can set "charge this folder's team".
   Cost preview shows which budget before the run.
5. **Approvals are social**: requestedOf = team-admin → any folder admin can approve, surfaced in
   web Triage and the desktop "My Work" tray.

## API surface (per CLAUDE.md mandatory rule)

- **Server Actions:** saveDraft, submitForReview, approveRevision, publish, createSchedule,
  toggleSchedule, approveRequest, abortSession, steerSession, createFolder, shareFolder
- **Routes:** `/api/runs/[id]/stream` (SSE), workflow execute (exists), `/api/hooks/[source]`,
  cron tick
- **Shared lib:** `src/lib/agent-platform/{revisions,sessions,steps,scheduler,approvals,folders}.ts`

## Build order

```
#21 session+step+Runs drawer        ← the spine
 ├─ #24 approval node + autonomy resolver + cost preview
 ├─ #22 schedules + SKIP LOCKED worker + /schedule + Triage
 ├─ #19 revisions/publish gates + NL workflow generation
 ├─ #17 folders/teamspaces → snapshots → Electric → multiplayer
 └─ #25 opencode desktop sessions surface here too
```
