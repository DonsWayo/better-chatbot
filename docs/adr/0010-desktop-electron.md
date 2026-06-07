# ADR-0010: Desktop app — Electron (with local-system MCP access)

**Status:** Accepted (direction set 2026-06-07: Electron; supersedes the Tauri thin-client in the Wave 10 spec)
**Date:** 2026-06-07
**Deciders:** Product, Engineering, IT, Security
**Gates:** Wave 10

## Context

The Wave 10 spec proposed a **Tauri** thin client (loads the deployed web app, no local access). A
Safe instead wants an **Electron** app (like LobeChat / Claude Desktop) that, on the desktop, can
reach the **local system** — local stdio MCP servers (filesystem, local Kubernetes, constrained
shell) — so power users (e.g. engineers) can use local file/k8s tools from chat, the way Claude
Desktop bridges local MCP. That is richer than a thin client.

## Decision

- **Use Electron, not Tauri.** Rationale: matches the LobeChat/Claude-desktop ecosystem and the
  mature local-process/MCP story; broad team familiarity; rich auto-update/packaging. Trade-off:
  larger binaries than Tauri — acceptable for an internal tool.
- **v1 — thin client + native niceties:** loads the same Next.js web UI from `ASAFE_APP_URL`
  (web/desktop parity, no UI fork); window-state persistence, app menu, notifications, native file
  dialogs, auto-update from an internal feed, system-browser SSO (deep-link callback).
- **v2 — local-system access (the differentiator):** the desktop **bridges local stdio MCP
  servers** (filesystem, a Kubernetes MCP, constrained shell) into the chat session — the
  Claude-Desktop model. **Gated:** only entitled users/teams (ADR-0009), filtered by guardrails
  (Wave 7), with **explicit per-action user consent** (excessive-agency control). Local tools run
  on the user's machine; results are surfaced to the agent.
- **Code** lives in a separate `desktop/` Electron package; the web app is unchanged (parity).

## Options for the local-MCP bridge (decide at build, Wave 10)

- (a) Desktop runs a **local MCP gateway**; the (remote) server connects to it over an
  authenticated tunnel.
- (b) A **local companion process** the desktop manages, exposing local MCP to the session.
- (c) A **local app instance** inside the desktop (heavier). Lean (a)/(b).

## Consequences

- **Easier:** power-user local tooling (files, k8s) without exposing it server-side; web parity.
- **Harder:** a **major Security review** — local code/k8s execution from chat is high-risk
  (sandboxing, consent, audit); code-signing + distribution per OS; the bridge is real engineering.
- **Supersedes** the Tauri choice in `docs/wave-10-desktop.md`.

## Open inputs needed

- **[Security]** Acceptable local capabilities (filesystem scope, k8s/shell?) + consent/audit
  model — a significant review before v2 ships.
- **[IT]** Code-signing certs + internal distribution/auto-update feed per OS.
- **[Product]** Which teams get local access (default-deny per ADR-0009).

## Action items

1. [ ] (W10) Scaffold `desktop/` Electron thin client — loads `ASAFE_APP_URL`, native niceties.
2. [ ] (W10) System-browser SSO + deep-link callback.
3. [ ] (W10) Local stdio MCP bridge (gated by ADR-0009 + Wave 7 + per-action consent) — Security sign-off first.
4. [ ] (W10) Code-signing + packaging (mac/win/linux) + auto-update; CI smoke build.
