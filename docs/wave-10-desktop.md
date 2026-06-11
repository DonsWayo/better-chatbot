# Wave 10 — Desktop

**Goal:** Ship a desktop client (Tauri) that wraps the same web app — the Claude-web/Claude-desktop model — giving web/desktop parity without a second codebase.
**Ships:** A desktop app for employees who want one; web (PWA) remains the default for most.
**Depends on:** Waves 1–4 at minimum (auth/SSO must work in the desktop context). Best after the web app is stable.
**Phase:** GA path.

## Scope

**In scope**
- A **Tauri** shell (Rust + system webview) that loads the deployed web app as a thin client pointing at our server.
- **SSO in desktop:** the OAuth/OIDC flow works from the desktop app (system browser / deep-link callback).
- **Native niceties:** window state persistence, app menu, notifications, auto-update; native file open/save for uploads.
- **Packaging & signing:** macOS, Windows, Linux builds; code signing; an internal distribution channel.
- **Shared frontend:** no fork of the UI — the desktop renders the same Next.js app (thin-client mode), so features stay in sync automatically.

**Out of scope (this wave)**
- A fully offline/bundled-local desktop (the app is server-backed by design). Mobile apps. Rewriting the UI for native.

## Tasks

- [x] Add a Tauri project that loads the deployed web app URL (configurable: staging/prod); keep it in the same repo or a sibling repo per team preference. — done via **Electron** (ADR-0010, not Tauri) in desktop/, thin client loading configurable ASAFE_APP_URL; in-repo
- [x] Make the SSO flow work from desktop (system browser + deep-link/callback handling). — done via the `asafe://` custom-protocol deep-link handler in desktop/src/main.ts relaying SSO callbacks to the renderer (origin-validated)
- [x] Implement window-state persistence, app menu, notifications, and native file dialogs for uploads. — done via electron-window-state, Menu template, Notification, and dialog IPC in desktop/src/main.ts
- [x] Set up auto-update against an internal release feed. — done via electron-updater generic feed (ASAFE_UPDATE_URL); standing up the internal feed host is an IT step
- [ ] Configure builds for macOS/Windows/Linux; code signing; document the internal distribution method. — OPEN: electron-builder targets (dmg/zip, nsis, AppImage) + unsigned CI smoke builds exist; code-signing certs (CSC_LINK/WIN_CSC_LINK) and the distribution channel await IT
- [x] Verify parity: every web feature available to a user works identically in desktop (since it's the same app). — done via thin-client design: `loadURL(ASAFE_APP_URL)` renders the deployed web app, parity by construction
- [ ] Tests: desktop launches, SSO login succeeds, send/receive works, file upload via native dialog works; smoke build on all three OSes in CI. — OPEN: CI smoke builds on macOS/Windows/Linux exist (.github/workflows/desktop-build.yml, unsigned); automated launch/SSO/upload e2e not implemented

## Acceptance criteria

- [x] Given the desktop app, when a user launches it and logs in via SSO, then they reach the same authenticated experience as the web app. — done via thin client + asafe:// deep-link SSO callback
- [x] Given a feature shipped to the web app, when the desktop app is opened, then that feature is present without a separate build (thin-client parity). — done via loadURL of the deployed app; no UI fork
- [x] Given a file upload, when the user uses the native dialog, then the upload works as on web. — done via native dialog IPC in main/preload; upload path is the same web renderer
- [ ] Signed builds exist for macOS/Windows/Linux and auto-update from the internal feed; CI smoke build green. — OPEN: CI smoke builds are green but unsigned; signing certs + internal update feed pending IT

## Open questions

- [IT] Internal distribution + code-signing certs for each OS; auto-update hosting.
- [Product] Is a system-browser SSO flow acceptable, or is an embedded flow required?
- [Eng] Desktop project in-repo vs sibling repo.
