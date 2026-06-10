# Asafe AI Desktop

Electron desktop client for Asafe AI. **Wave 10** deliverable.

---

## Architecture: thin-client model

The desktop app is a **thin client** — it loads the exact same Next.js web UI served at `ASAFE_APP_URL`. There is no UI fork. Feature parity with the web is automatic.

The app adds native niceties on top:

- Persistent window size/position (electron-window-state)
- Native application menu with standard OS behaviours
- Single-instance lock (second launch focuses the existing window)
- System-browser SSO flow (see below)
- Auto-update from an internal feed (see below)
- **Wave 10 roadmap:** local stdio MCP bridge for filesystem / Kubernetes access (see below)

```
┌────────────────────────────────────────────────┐
│  Electron BrowserWindow                         │
│  ┌──────────────────────────────────────────┐  │
│  │  Next.js web UI  (loaded from APP_URL)   │  │
│  │  window.asafeDesktop.isDesktop === true  │  │
│  └──────────────────────────────────────────┘  │
│                                                 │
│  main.ts  ←── IPC ──→  preload.ts              │
│  (Node/Electron)        (contextBridge)         │
└────────────────────────────────────────────────┘
```

---

## Environment variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `ASAFE_APP_URL` | No | `http://localhost:3000` | URL of the Next.js web app to load. Point at your deployed environment. Also the base for the opencode gateway endpoint (see below). |
| `ASAFE_UPDATE_URL` | No | *(unset)* | Base URL of an electron-updater–compatible update feed. When unset, auto-update is disabled (safe for local dev). |
| `ASAFE_DESKTOP_OPENCODE` | No | *(unset — disabled)* | Set to `1` to opt in to the governed coding (opencode) surface. Default deny per ADR-0010. |
| `ASAFE_OPENCODE_BIN` | No | *(unset — PATH lookup)* | Absolute path to the `opencode` binary. When unset, `opencode` is resolved from `PATH`. |
| `ASAFE_SESSION_TOKEN` | No | *(unset)* | The user's asafe session token, passed through to the spawned opencode server so its gateway calls authenticate as the user. |

---

## SSO via system browser + deep-link callback

Enterprise SSO (SAML / OIDC, ADR-0005) is handled by the **web app's existing auth flow**. The desktop defers to it:

1. The BrowserWindow loads `ASAFE_APP_URL`; if the user is not authenticated, the web app redirects to the IdP.
2. Because the IdP redirect is cross-origin, `setWindowOpenHandler` + `will-navigate` intercept it and open the system browser.
3. After the IdP callback the user is redirected back to `ASAFE_APP_URL`; the web app completes the session and the BrowserWindow reloads the authenticated UI.

**Deep-link callback (planned, not implemented):** For seamless in-app SSO the OS can register the `asafe://` URL scheme. After IdP authentication the callback URL uses `asafe://auth/callback?code=…`, the OS activates the desktop app, the app extracts the code and completes the PKCE exchange. This requires:

- macOS: `CFBundleURLTypes` in `Info.plist` (electron-builder config)
- Windows: registry key via NSIS installer
- Security: validate `state` parameter to prevent CSRF; restrict which hosts may trigger the callback

This is a **Wave 10 open item** and requires Security review before enabling.

---

## Local-system access roadmap (the differentiator)

> **Status:** Documented architecture, not yet implemented. Requires Security sign-off per ADR-0010 before any local-execution code ships.

The key capability that differentiates the desktop from the web app is **bridging local stdio MCP servers** into the chat session — the same model used by Claude Desktop.

### What this enables

| MCP server | Capability |
|---|---|
| `@modelcontextprotocol/server-filesystem` | Read/write local files within a scoped directory |
| kubernetes MCP (e.g. `mcp-server-kubernetes`) | `kubectl`-equivalent queries against local kubeconfig |
| constrained shell | Scoped, audited shell commands (Security review required) |

Engineers in entitled teams (ADR-0009) will be able to use these tools directly from the chat, without exposing their local system to the cloud.

### Security gates (non-negotiable before v2 ships)

1. **Entitlement check (ADR-0009):** the bridge is default-deny. Only users/teams explicitly granted the `desktop:local-mcp` entitlement can activate it.
2. **Per-action user consent:** before the main process executes any local tool call, a native dialog shows the tool name, arguments, and potential impact. The user must approve each action (excessive-agency control, Wave 7 guardrails).
3. **Guardrail filtering (Wave 7):** tool inputs and outputs pass through the guardrail/DLP layer (ADR-0008) before being returned to the agent.
4. **Audit logging:** every local tool invocation is logged to the central audit sink (team, user, tool, args hash, timestamp, outcome).
5. **Security review:** a formal Security review of the local execution model is required before any v2 code is merged. See ADR-0010 open inputs.

### Bridge architecture options (decide at Wave 10 build)

**Option A — Local MCP gateway over authenticated tunnel**

```
Desktop app
  └─ spawns local stdio MCP servers
  └─ exposes them on a loopback port
  └─ the remote server connects via an authenticated tunnel
         (mTLS or signed JWT)
```

Pros: server-side agent can reach local tools directly; no app-level tool routing.
Cons: tunnel management; the server initiates the connection (firewall-friendly options needed).

**Option B — Local companion process**

```
Desktop app
  └─ manages a companion process (Node/Rust)
  └─ companion proxies stdio MCP calls over IPC
  └─ desktop preload forwards tool requests via contextBridge ↔ ipcRenderer
```

Pros: no inbound tunnel; fully app-mediated (consent dialog is easy to inject).
Cons: extra IPC hop; companion process lifecycle to manage.

Lean toward **Option A or B** (avoid Option C — full local app instance, too heavy).
Decision recorded in [docs/adr/0010-desktop-electron.md](../docs/adr/0010-desktop-electron.md).

### Implementation TODO (Wave 10)

1. Security sign-off on acceptable local capabilities (filesystem scope, k8s/shell) + consent/audit model.
2. Choose Option A vs B; scaffold bridge in `src/mcp-bridge.ts`.
3. Spawn / manage stdio MCP child processes from `main.ts`.
4. Expose `listLocalTools` / `invokeLocalTool` via `preload.ts` contextBridge (see commented TODO).
5. Build consent dialog (native `dialog.showMessageBox`) before each tool execution.
6. Route tool results back to the web app chat session via the existing MCP client.
7. Code-signing + notarization per OS (IT must provide certs, see ADR-0010 open inputs).

---

## Governed coding (opencode)

> **Status:** Lifecycle management implemented (`src/opencode-manager.ts`), **disabled by default** (ADR-0010). No chat/coding UI yet. The web-side gateway endpoint does not exist yet — the contract is documented below and in the manager's header comment.

Per the next-gen platform blueprint, the desktop embeds the open-source [opencode](https://opencode.ai) server (`@opencode-ai/sdk`) as a **governed coding surface**: engineers get a local coding agent on their own machine, but its **model calls route through the asafe OpenRouter gateway** — so coding sessions inherit the same model entitlements, budgets, and audit trail as chat. The desktop never holds provider API keys.

### How it works

```
Electron main process (src/opencode-manager.ts)
  └─ gate check: ASAFE_DESKTOP_OPENCODE=1  AND  policy.allowSpawn   ← default deny (ADR-0010)
  └─ locates `opencode` (ASAFE_OPENCODE_BIN, else PATH) — "unavailable" if absent
  └─ spawns `opencode serve --port 0 --hostname 127.0.0.1`
       env OPENCODE_CONFIG_CONTENT = scoped provider config (never touches user config):
         provider.asafe → @ai-sdk/openai-compatible
           baseURL = ${ASAFE_APP_URL}/api/gateway/openrouter
           apiKey  = {env:ASAFE_SESSION_TOKEN}
  └─ parses the chosen port from stdout → endpoint http://127.0.0.1:<port>
  └─ crash restart cap (3), SIGTERM on app quit (SIGKILL after 5s)

renderer (web UI)
  └─ window.asafeDesktop.opencode.status() / .start() / .stop()
       └─ ipcRenderer.invoke("opencode:…") → ipcMain.handle in main.ts
```

Lifecycle states: `stopped` → `starting` → `running`, plus `unavailable` (gate closed at probe time / binary missing — with a helpful message, never a throw) and `error` (spawn/startup failure, or restart cap exhausted).

### Gateway contract (web side — to be implemented)

| Aspect | Contract |
|---|---|
| Endpoint | `${ASAFE_APP_URL}/api/gateway/openrouter` |
| Protocol | OpenAI-compatible chat completions (opencode's provider plugin is `@ai-sdk/openai-compatible`, i.e. `POST <baseURL>/chat/completions`, streaming SSE) |
| Auth | `Authorization: Bearer <ASAFE_SESSION_TOKEN>` — the user's web session token, **not** a provider key. The gateway validates the session. |
| Models | Resolved server-side through the layered model entitlements (org base + team overrides). The gateway rejects non-entitled models; the desktop ships an empty model map until the gateway exposes a model listing. |
| Budgets/audit | Usage metered against the same org/team budgets as chat (ADR-0003); audit events carry `originSurface: "opencode"`. |

### Enabling it (dev only, until the signed policy plane ships)

```bash
# In desktop/:
ASAFE_DESKTOP_OPENCODE=1 \
ASAFE_OPENCODE_BIN=/usr/local/bin/opencode \   # optional; PATH lookup otherwise
ASAFE_APP_URL=http://localhost:3000 \
pnpm dev
```

### Security posture

- **Disabled by default** — without `ASAFE_DESKTOP_OPENCODE=1` the manager is inert: nothing is probed, spawned, or written. Mirrors the mcp-bridge sign-off convention (ADR-0010).
- The env opt-in is **interim**: a signed, server-distributed policy plane will replace it before GA (`defineOpencodePolicy()` in `src/opencode-manager.ts` is the seam). The env var then becomes a local opt-in ANDed with the signed policy, never a bypass.
- The server binds **loopback only** (`127.0.0.1`, OS-assigned port).
- The governance config is injected via `OPENCODE_CONFIG_CONTENT` (highest-precedence runtime override) — the user's global/project opencode config is never modified.

---

## How to run (development)

### Prerequisites

```bash
# From the desktop/ directory:
pnpm install   # or npm install
```

### Step 1 — Start the web app

```bash
# In the repo root:
pnpm dev       # starts Next.js on http://localhost:3000
```

### Step 2 — Start the desktop app

```bash
# In desktop/:
pnpm compile               # compile TypeScript → dist/
ASAFE_APP_URL=http://localhost:3000 pnpm dev
```

The Electron window opens and loads the running web app. `window.asafeDesktop.isDesktop` is `true` — the web UI can use this flag to show desktop-specific UI hints.

### Automated testing with the Electron MCP server

The desktop app exposes a Chrome DevTools Protocol endpoint in development
(port `9222`, auto-enabled when not packaged) so AI tooling can drive it —
the desktop equivalent of Playwright MCP on web.

We use [`@laststance/electron-mcp-server`](https://github.com/laststance/electron-mcp-server)
(v2, ~44 granular `electron_*` tools: screenshot, click, fill, wait, eval,
logs, storage). Install into Claude Code at user scope:

```bash
claude mcp add electron --scope user -e SECURITY_LEVEL=development -- npx -y @laststance/electron-mcp-server@latest
```

Workflow:

1. Start the desktop app in dev (CDP on `9222` is automatic).
2. Ask Claude to e.g. `electron_take_screenshot`, `electron_click_by_text`,
   `electron_fill_input`, `read_electron_logs` — the MCP auto-discovers the
   app by scanning ports 9222-9225.

For testing a **packaged** build (CI e2e), set `ASAFE_CDP_PORT=9222`
explicitly — CDP is never enabled in packaged builds otherwise.

### Building a distributable

```bash
# In desktop/:
pnpm compile && pnpm build
# Output in release/ (dmg / exe / AppImage depending on OS)
```

> **Note:** Icons in `build/` are placeholders. Replace `build/icon.icns`, `build/icon.ico`, and `build/icon.png` before shipping. Code-signing credentials are a Wave 10 open item (IT).
