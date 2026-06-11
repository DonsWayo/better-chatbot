# Conek AI — Mobile (Capacitor)

iOS + Android **remote thin client**, mirroring the desktop philosophy
(`desktop/`): the native shell loads the deployed web UI at
**https://ai.conek.dev** via Capacitor's `server.url`. There is no UI fork —
feature parity with the web is automatic, and ship cadence for the UI is the
web deploy, not an app-store release.

```
┌─────────────────────────────────────────────┐
│  Native shell (Capacitor 8, iOS/Android)    │
│  ┌───────────────────────────────────────┐  │
│  │  Next.js web UI (loaded from          │  │
│  │  server.url = https://ai.conek.dev)   │  │
│  └───────────────────────────────────────┘  │
│  Plugins (StatusBar, SplashScreen, App,     │
│  Keyboard, Browser) compiled natively;      │
│  the WEB app drives them at runtime via     │
│  window.Capacitor.Plugins (no npm deps in   │
│  the web bundle) — src/lib/native/capacitor.ts
└─────────────────────────────────────────────┘
```

This package is standalone (own `package.json`, like `desktop/`) — there is no
pnpm workspace; do not add Capacitor deps to the root project.

## Layout

| Path | What |
|---|---|
| `capacitor.config.ts` | appId `dev.conek.ai` (confirm with IT before store signing), `server.url`, SSO `allowNavigation`, plugin config. |
| `www/` | Placeholder webDir — never rendered; `server.url` wins. |
| `resources/icon.svg`, `resources/splash.svg` | Brand sources (Conek teal mark) for `pnpm run resources`. |
| `ios/`, `android/` | Generated native projects (checked in, Capacitor convention). iOS uses **SPM** (`CapApp-SPM/`), no CocoaPods needed. |
| `../src/lib/native/capacitor.ts` (web repo) | The web-side bridge: StatusBar teal, SplashScreen hide, Android back button, iOS keyboard resize. No-ops outside the shell. |

## Dev loop

```bash
cd mobile
pnpm install

# Point the shell at your local dev server (cleartext auto-enabled for http://)
MOBILE_APP_URL=http://localhost:3000 pnpm sync     # or a LAN IP for a real device:
MOBILE_APP_URL=http://192.168.1.50:3000 pnpm sync

pnpm open:android    # Android Studio
pnpm open:ios        # Xcode (needs full Xcode, not just CommandLineTools)
```

Re-run `pnpm sync` (no env var) before building anything you intend to
distribute — it bakes `server.url` back to production and disables cleartext.
Because the UI is remote, "livereload" is just your normal `next dev` HMR; the
shell only needs a re-sync when `capacitor.config.ts` or plugins change.

Icons/splash: edit `resources/*.svg`, then `pnpm run resources` (regenerates
all densities into `ios/` + `android/` via `@capacitor/assets`).

## Auth / SSO

The webview is a real browser context: the existing session cookie flow works
unchanged, and sessions persist across app restarts (native cookie jar).
Microsoft Entra ID redirects (`login.microsoftonline.com` and friends) are in
`server.allowNavigation`, so the SSO dance stays **in-webview** and the
callback lands cookies in the right jar.

Hardening follow-up (recommended, mirrors the desktop system-browser SSO):
move IdP auth to `@capacitor/browser` (already installed in the shell), i.e.
open the IdP in the system browser / Custom Tab and return via an
`app`-scheme or universal-link callback. That buys phishing-resistant browser
UI, shared device SSO state, and WebAuthn — but requires a redirect-URI
registration with IT, so it is not wired yet. Conditional-access policies
that block "embedded browsers" will require this step.

## Building / signing (IT follow-up, like desktop)

- **iOS**: needs a Mac with full Xcode (`xcodebuild`), an Apple Developer
  team, and the `dev.conek.ai` bundle ID registered. `pnpm sync:ios`, open
  Xcode, set the signing team, archive.
- **Android**: needs Android Studio or SDK + JDK 21. `pnpm sync:android`,
  open Android Studio, generate a signed AAB with the IT-held keystore.
  (A `android/local.properties` pointing at your SDK is created per-machine
  and gitignored.)
- Distribution (ABM/MDM, managed Google Play vs public stores) is an IT
  decision — same status as desktop code-signing.

## Scripts

| Script | What |
|---|---|
| `pnpm sync` / `sync:ios` / `sync:android` | Copy config + web placeholder into native projects, update plugins. |
| `pnpm open:ios` / `open:android` | Open the native IDE. |
| `pnpm resources` | Regenerate icons + splash from `resources/*.svg`. |
| `pnpm typecheck` | TS check for `capacitor.config.ts`. |
