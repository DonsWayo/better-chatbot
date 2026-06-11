import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Conek AI mobile — Capacitor remote thin client.
 *
 * Philosophy (mirrors desktop/): the native shell loads the deployed web UI
 * directly via `server.url`. There is no bundled UI fork — `www/` only holds
 * a placeholder page that Capacitor requires as a webDir; it is never shown
 * because `server.url` takes over.
 *
 * Dev loop: point the shell at a local dev server with
 *   MOBILE_APP_URL=http://localhost:3000 npx cap sync
 * (`cleartext` is enabled automatically — and ONLY — for http:// URLs, so
 * production builds never allow cleartext traffic).
 */

const DEFAULT_APP_URL = "https://ai.conek.dev";

/** Small config helper: resolve the app URL + whether cleartext is needed. */
function resolveAppUrl(): { url: string; cleartext: boolean } {
  const raw = process.env.MOBILE_APP_URL?.trim();
  const url = raw && raw.length > 0 ? raw : DEFAULT_APP_URL;
  // Android blocks cleartext by default; only opt in for explicit http://
  // dev URLs (e.g. http://localhost:3000 or a LAN IP for device testing).
  return { url, cleartext: url.startsWith("http://") };
}

const { url, cleartext } = resolveAppUrl();

const config: CapacitorConfig = {
  // TODO(confirm-later): appId pending IT confirmation — must match the
  // Apple Developer bundle ID and Play Console application ID at signing
  // time; changing it later forces a new store listing.
  appId: "dev.conek.ai",
  appName: "Conek AI",
  // Required by Capacitor even for remote shells; contains only a
  // placeholder index.html (never rendered — server.url wins).
  webDir: "www",
  server: {
    url,
    cleartext,
    // Origins allowed to render INSIDE the webview (everything else opens
    // externally). The Entra ID (Azure AD) domains keep the Microsoft SSO
    // redirect dance in-webview so the session cookie lands on the webview's
    // cookie jar. See mobile/README.md for the @capacitor/browser alternative
    // (system-browser SSO), which is the recommended hardening follow-up.
    allowNavigation: [
      "ai.conek.dev",
      // Microsoft Entra ID / Azure AD SSO endpoints
      "login.microsoftonline.com",
      "*.microsoftonline.com",
      "login.live.com",
      "login.microsoft.com",
      "aadcdn.msftauth.net",
      "aadcdn.msauth.net",
    ],
  },
  ios: {
    // Solid background behind the webview while the remote page loads
    backgroundColor: "#0B1220",
  },
  android: {
    backgroundColor: "#0B1220",
  },
  plugins: {
    SplashScreen: {
      // The web app hides the splash itself once it has painted
      // (src/lib/native/capacitor.ts in the web repo); keep a generous
      // ceiling so a slow network never strands the user on the splash.
      launchShowDuration: 5000,
      launchAutoHide: true,
      backgroundColor: "#0B1220",
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: false,
    },
    StatusBar: {
      // Teal brand bar with light (white) content; the web bridge re-applies
      // this at runtime in case the OS theme flips.
      style: "DARK",
      backgroundColor: "#3ABFC6",
      overlaysWebView: false,
    },
    Keyboard: {
      // iOS: resize the webview natively so chat input stays visible.
      // Android resize is handled by android:windowSoftInputMode.
      resize: "native",
    },
  },
};

export default config;
