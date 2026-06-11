/**
 * Capacitor native bridge — web-side half of the Conek AI mobile app.
 *
 * The mobile app (mobile/) is a REMOTE thin client: the native shell loads
 * this deployed web UI directly via Capacitor's `server.url`, so this module
 * runs inside the native WebView but ships with the web bundle.
 *
 * Design choice — runtime feature-detection, NOT imports:
 * the `@capacitor/*` npm packages are intentionally NOT installed in the web
 * project. When the native shell hosts the page, the Capacitor runtime is
 * injected natively and every installed plugin is reachable at
 * `window.Capacitor.Plugins.<Name>`. Detecting that global at runtime means
 * the web bundle does not grow by a byte, cannot break when the packages are
 * absent, and the same deployment serves browsers, Electron, and mobile.
 *
 * On plain web (or Electron) every export here is a no-op.
 */

/** Minimal structural types for the injected Capacitor runtime. */
interface CapacitorListenerHandle {
  remove: () => Promise<void>;
}

interface StatusBarPlugin {
  setStyle(options: { style: "DARK" | "LIGHT" | "DEFAULT" }): Promise<void>;
  setBackgroundColor(options: { color: string }): Promise<void>;
}

interface SplashScreenPlugin {
  hide(): Promise<void>;
}

interface BackButtonEvent {
  canGoBack: boolean;
}

interface AppPlugin {
  addListener(
    eventName: "backButton",
    listener: (event: BackButtonEvent) => void,
  ): Promise<CapacitorListenerHandle>;
  minimizeApp(): Promise<void>;
  exitApp(): Promise<void>;
}

interface KeyboardPlugin {
  setResizeMode(options: {
    mode: "body" | "ionic" | "native" | "none";
  }): Promise<void>;
}

interface CapacitorPlugins {
  StatusBar?: StatusBarPlugin;
  SplashScreen?: SplashScreenPlugin;
  App?: AppPlugin;
  Keyboard?: KeyboardPlugin;
}

interface CapacitorRuntime {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
  Plugins?: CapacitorPlugins;
}

/** Conek brand teal — keep in sync with mobile/capacitor.config.ts. */
const CONEK_TEAL = "#3ABFC6";

function getCapacitorRuntime(): CapacitorRuntime | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as Window & { Capacitor?: CapacitorRuntime }).Capacitor;
}

/** True only when running inside the Capacitor native shell (iOS/Android). */
export function isNativeCapacitor(): boolean {
  const runtime = getCapacitorRuntime();
  return runtime?.isNativePlatform?.() === true;
}

let initialized = false;

/**
 * Apply the native niceties once per page load. Safe to call from any
 * client component; resolves `false` (and does nothing) outside the native
 * shell. Each plugin call is individually guarded — a missing plugin or a
 * native-side error never breaks the web app.
 */
export async function initNativeBridge(): Promise<boolean> {
  if (initialized) return true;
  const runtime = getCapacitorRuntime();
  if (!runtime?.isNativePlatform?.()) return false;
  initialized = true;

  const plugins = runtime.Plugins ?? {};
  const platform = runtime.getPlatform?.();

  // Status bar: teal brand background (Android) with light content.
  try {
    await plugins.StatusBar?.setStyle({ style: "DARK" });
    if (platform === "android") {
      await plugins.StatusBar?.setBackgroundColor({ color: CONEK_TEAL });
    }
  } catch {
    // StatusBar not available (e.g. plugin not installed in this shell build)
  }

  // Keyboard: native resize so the chat composer stays visible (iOS only;
  // Android uses windowSoftInputMode from the manifest).
  if (platform === "ios") {
    try {
      await plugins.Keyboard?.setResizeMode({ mode: "native" });
    } catch {
      // Keyboard plugin unavailable
    }
  }

  // Android hardware/gesture back: walk web history when possible,
  // otherwise minimize instead of killing the session.
  try {
    await plugins.App?.addListener("backButton", (event) => {
      if (event.canGoBack && window.history.length > 1) {
        window.history.back();
      } else {
        void plugins.App?.minimizeApp().catch(() => undefined);
      }
    });
  } catch {
    // App plugin unavailable
  }

  // The web app has painted by the time this runs — drop the splash.
  // (capacitor.config.ts keeps launchAutoHide as a 5s safety net.)
  try {
    await plugins.SplashScreen?.hide();
  } catch {
    // SplashScreen plugin unavailable
  }

  return true;
}

/** Test-only: reset the once-per-load guard. */
export function resetNativeBridgeForTesting(): void {
  initialized = false;
}
