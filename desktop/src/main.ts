/**
 * @asafe-ai/desktop — Electron main process
 *
 * v1: thin client — loads the Next.js web app from ASAFE_APP_URL.
 * v2 (Wave 10): local stdio MCP bridge for filesystem / k8s / constrained shell access.
 *
 * Security posture:
 *   - contextIsolation: true   (renderer cannot reach Node APIs directly)
 *   - nodeIntegration: false   (no direct Node in renderer)
 *   - sandbox: true            (OS-level process sandbox)
 *   - External navigation intercepted → shell.openExternal only for safe origins
 */

import {
  app,
  BrowserWindow,
  Menu,
  MenuItem,
  shell,
  type MenuItemConstructorOptions,
} from "electron";
import { autoUpdater } from "electron-updater";
import windowStateKeeper from "electron-window-state";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const APP_URL =
  process.env["ASAFE_APP_URL"] ?? "http://localhost:3000";

const UPDATE_URL = process.env["ASAFE_UPDATE_URL"]; // undefined → auto-update disabled

// Origins we will open inside the app window (same origin as the web app).
// Everything else goes to the system browser.
function isSameAppOrigin(url: string): boolean {
  try {
    const target = new URL(url);
    const base = new URL(APP_URL);
    return target.origin === base.origin;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Single-instance lock
// ---------------------------------------------------------------------------

const isPrimaryInstance = app.requestSingleInstanceLock();

if (!isPrimaryInstance) {
  app.quit();
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Window factory
// ---------------------------------------------------------------------------

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  // Persist window size and position across restarts.
  const windowState = windowStateKeeper({
    defaultWidth: 1280,
    defaultHeight: 800,
  });

  mainWindow = new BrowserWindow({
    x: windowState.x,
    y: windowState.y,
    width: windowState.width,
    height: windowState.height,
    minWidth: 800,
    minHeight: 600,
    title: "Asafe AI",
    // Icon is resolved at build-time by electron-builder from build/icon.{png,ico,icns}
    webPreferences: {
      // ----- Security hardening -----
      contextIsolation: true,   // renderer ↔ main only via contextBridge
      nodeIntegration: false,   // no raw Node in renderer
      sandbox: true,            // OS-level sandboxing
      // ------------------------------
      preload: path.join(__dirname, "preload.js"),
    },
  });

  // Track window state changes.
  windowState.manage(mainWindow);

  // Load the web app.
  mainWindow.loadURL(APP_URL);

  // ------------------------------------------------------------------
  // Navigation security: intercept new-window / will-navigate events.
  //
  // Rule: links to the same origin stay in the window;
  //       all cross-origin URLs open in the system browser.
  // ------------------------------------------------------------------

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isSameAppOrigin(url)) {
      // Allow Electron to handle same-origin popups normally.
      return { action: "allow" };
    }
    // Open external links (e.g. OAuth, docs) in the system browser.
    setImmediate(() => void shell.openExternal(url));
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!isSameAppOrigin(url)) {
      event.preventDefault();
      void shell.openExternal(url);
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// ---------------------------------------------------------------------------
// Application menu
// ---------------------------------------------------------------------------

function buildMenu(): void {
  const isMac = process.platform === "darwin";

  const template: (MenuItemConstructorOptions | MenuItem)[] = [
    // macOS: app menu
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: "about" as const },
              { type: "separator" as const },
              { role: "services" as const },
              { type: "separator" as const },
              { role: "hide" as const },
              { role: "hideOthers" as const },
              { role: "unhide" as const },
              { type: "separator" as const },
              { role: "quit" as const },
            ],
          },
        ]
      : []),

    // File
    {
      label: "File",
      submenu: [
        isMac ? { role: "close" as const } : { role: "quit" as const },
      ],
    },

    // Edit
    {
      label: "Edit",
      submenu: [
        { role: "undo" as const },
        { role: "redo" as const },
        { type: "separator" as const },
        { role: "cut" as const },
        { role: "copy" as const },
        { role: "paste" as const },
        ...(isMac
          ? [
              { role: "pasteAndMatchStyle" as const },
              { role: "delete" as const },
              { role: "selectAll" as const },
            ]
          : [{ role: "delete" as const }, { role: "selectAll" as const }]),
      ],
    },

    // View
    {
      label: "View",
      submenu: [
        { role: "reload" as const },
        { role: "forceReload" as const },
        { role: "toggleDevTools" as const },
        { type: "separator" as const },
        { role: "resetZoom" as const },
        { role: "zoomIn" as const },
        { role: "zoomOut" as const },
        { type: "separator" as const },
        { role: "togglefullscreen" as const },
      ],
    },

    // Window
    {
      label: "Window",
      submenu: [
        { role: "minimize" as const },
        { role: "zoom" as const },
        ...(isMac
          ? [
              { type: "separator" as const },
              { role: "front" as const },
              { type: "separator" as const },
              { role: "window" as const },
            ]
          : [{ role: "close" as const }]),
      ],
    },

    // Help
    {
      role: "help" as const,
      submenu: [
        {
          label: "Asafe AI Documentation",
          click: () =>
            void shell.openExternal("https://docs.asafe.ai"),
        },
        {
          label: "Report an Issue",
          click: () =>
            void shell.openExternal(
              "https://github.com/asafe-digital/asafe-ai/issues"
            ),
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// ---------------------------------------------------------------------------
// Auto-update (only when ASAFE_UPDATE_URL is set — no-op in dev)
// ---------------------------------------------------------------------------

function initAutoUpdate(): void {
  if (!UPDATE_URL) {
    console.info("[auto-update] ASAFE_UPDATE_URL not set — skipping auto-update.");
    return;
  }

  autoUpdater.setFeedURL({ provider: "generic", url: UPDATE_URL });

  autoUpdater.on("update-available", () => {
    console.info("[auto-update] Update available — downloading…");
  });

  autoUpdater.on("update-downloaded", () => {
    console.info("[auto-update] Update downloaded — will install on restart.");
    // TODO (Wave 10): show a native dialog offering "Restart now" vs "Later".
    autoUpdater.quitAndInstall();
  });

  autoUpdater.on("error", (err: Error) => {
    console.error("[auto-update] Error:", err);
  });

  autoUpdater.checkForUpdatesAndNotify().catch((err: unknown) => {
    console.error("[auto-update] checkForUpdatesAndNotify failed:", err);
  });
}

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------

app.on("ready", () => {
  buildMenu();
  createWindow();
  initAutoUpdate();
});

// macOS: re-open window when dock icon is clicked and no windows are open.
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Quit when all windows are closed, except on macOS (standard behaviour).
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

// Focus existing window when a second instance is launched.
app.on("second-instance", () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

// ---------------------------------------------------------------------------
// TODO (Wave 10 — local-MCP bridge)
// ---------------------------------------------------------------------------
// 1. Spawn / manage local stdio MCP server child processes (e.g.
//    @modelcontextprotocol/server-filesystem, a k8s MCP).
// 2. Expose an IPC channel so the renderer/preload can forward tool-call
//    requests to local MCP servers and return results.
// 3. Gate bridge access by entitlement check (ADR-0009) before spawning.
// 4. Implement explicit per-action user-consent dialog before any local
//    execution (excessive-agency control per Wave 7 guardrails).
// 5. Audit-log every local tool invocation to the central audit sink.
// 6. Choose bridge architecture: (a) local MCP gateway over authenticated
//    tunnel, or (b) local companion process the desktop manages. See ADR-0010.
