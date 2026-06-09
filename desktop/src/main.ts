/**
 * @asafe-ai/desktop — Electron main process
 *
 * v1: thin client — loads the Next.js web app from ASAFE_APP_URL.
 *     Includes: SSO deep-link, native file dialogs, notifications, window state, auto-update.
 * v2 (Wave 10 gated): local stdio MCP bridge for filesystem / k8s / constrained shell access.
 *
 * Security posture:
 *   - contextIsolation: true   (renderer cannot reach Node APIs directly)
 *   - nodeIntegration: false   (no direct Node in renderer)
 *   - sandbox: false           (preload needs ipcRenderer; contextBridge still active)
 *   - External navigation intercepted → shell.openExternal only for safe origins
 */

import {
  app,
  BrowserWindow,
  Menu,
  MenuItem,
  Notification,
  dialog,
  ipcMain,
  shell,
  type MenuItemConstructorOptions,
} from "electron";
// electron-updater is CommonJS — named imports break under ESM ("type": "module")
import electronUpdaterPkg from "electron-updater";
import windowStateKeeper from "electron-window-state";

const { autoUpdater } = electronUpdaterPkg;
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const APP_URL =
  process.env["ASAFE_APP_URL"] ?? "http://localhost:3000";

const UPDATE_URL = process.env["ASAFE_UPDATE_URL"];

// ---------------------------------------------------------------------------
// Chrome DevTools Protocol — automation & testing hook
//
// Exposes a CDP endpoint so AI tooling (Electron MCP server, Playwright
// _electron) can attach for automated testing — the desktop equivalent of
// Playwright MCP on web. The MCP server auto-scans ports 9222-9225.
//
// Security: dev-only by default. Never enabled in packaged builds unless
// ASAFE_CDP_PORT is explicitly set (e.g. CI e2e runs against a packaged app).
// ---------------------------------------------------------------------------

const CDP_PORT = process.env["ASAFE_CDP_PORT"];
if (!app.isPackaged || CDP_PORT) {
  app.commandLine.appendSwitch("remote-debugging-port", CDP_PORT ?? "9222");
  console.info(
    `[cdp] Remote debugging enabled on port ${CDP_PORT ?? "9222"} (Electron MCP / Playwright can attach)`,
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
// Deep-link / protocol handler (SSO callback)
//
// Registers asafe:// as a custom protocol. When the OS activates the app via
// a deep link (e.g. asafe://auth/callback?code=…), we relay the URL to the
// renderer so the web app can complete the OAuth PKCE exchange.
//
// Security: only relay to the known APP_URL origin; validate state param in renderer.
// ---------------------------------------------------------------------------

const DEEP_LINK_SCHEME = "asafe";

if (process.defaultApp) {
  // Dev: argv[2] holds the URL in development mode
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient(DEEP_LINK_SCHEME, process.execPath, [
      path.resolve(process.argv[1] ?? ""),
    ]);
  }
} else {
  app.setAsDefaultProtocolClient(DEEP_LINK_SCHEME);
}

function handleDeepLink(url: string): void {
  if (!url.startsWith(`${DEEP_LINK_SCHEME}://`)) return;
  console.info("[deep-link] Received:", url);

  // Restore / focus the main window, then relay to renderer.
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
    mainWindow.webContents.send("deep-link", url);
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
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // preload uses ipcRenderer; contextBridge still isolates renderer
      preload: path.join(__dirname, "preload.js"),
    },
  });

  windowState.manage(mainWindow);
  mainWindow.loadURL(APP_URL);

  // ------------------------------------------------------------------
  // Navigation security
  // ------------------------------------------------------------------

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isSameAppOrigin(url)) {
      return { action: "allow" };
    }
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

    {
      label: "File",
      submenu: [
        isMac ? { role: "close" as const } : { role: "quit" as const },
      ],
    },

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

    {
      role: "help" as const,
      submenu: [
        {
          label: "Asafe AI Documentation",
          click: () => void shell.openExternal("https://docs.asafe.ai"),
        },
        {
          label: "Report an Issue",
          click: () =>
            void shell.openExternal(
              "https://github.com/asafe-digital/asafe-ai/issues",
            ),
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// ---------------------------------------------------------------------------
// IPC handlers — native file dialog
// ---------------------------------------------------------------------------

ipcMain.handle(
  "dialog:openFile",
  async (_event, options: Electron.OpenDialogOptions) => {
    if (!mainWindow) return { canceled: true, filePaths: [] };
    return dialog.showOpenDialog(mainWindow, {
      properties: ["openFile", "multiSelections"],
      ...options,
    });
  },
);

ipcMain.handle(
  "dialog:saveFile",
  async (_event, options: Electron.SaveDialogOptions) => {
    if (!mainWindow) return { canceled: true, filePath: undefined };
    return dialog.showSaveDialog(mainWindow, options);
  },
);

// ---------------------------------------------------------------------------
// IPC handlers — native notifications
// ---------------------------------------------------------------------------

ipcMain.handle(
  "notify",
  (_event, { title, body }: { title: string; body: string }) => {
    if (!Notification.isSupported()) return;
    const n = new Notification({ title, body });
    n.show();
  },
);

// ---------------------------------------------------------------------------
// Auto-update
// ---------------------------------------------------------------------------

function initAutoUpdate(): void {
  if (!UPDATE_URL) {
    console.info("[auto-update] ASAFE_UPDATE_URL not set — skipping.");
    return;
  }

  autoUpdater.setFeedURL({ provider: "generic", url: UPDATE_URL });

  autoUpdater.on("update-available", () => {
    console.info("[auto-update] Update available — downloading…");
  });

  autoUpdater.on("update-downloaded", () => {
    console.info("[auto-update] Update downloaded — installing on restart.");
    if (Notification.isSupported()) {
      const n = new Notification({
        title: "Asafe AI update ready",
        body: "A new version will be installed when you restart the app.",
      });
      n.show();
    }
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

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

// Focus existing window when a second instance is launched (Windows / Linux).
// On macOS, the OS activates the app via `open-url` below.
app.on("second-instance", (_event, argv) => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
  // On Windows / Linux, the deep-link URL is in argv
  const url = argv.find((arg) => arg.startsWith(`${DEEP_LINK_SCHEME}://`));
  if (url) handleDeepLink(url);
});

// macOS: deep-link arrives via open-url
app.on("open-url", (event, url) => {
  event.preventDefault();
  handleDeepLink(url);
});

// ---------------------------------------------------------------------------
// Wave 10 v2 — local stdio MCP bridge (gated)
// ---------------------------------------------------------------------------
//
// NOT yet implemented. Requires before shipping:
//   1. Security sign-off on acceptable local capabilities (ADR-0010)
//   2. Entitlement check via server API (ADR-0009: desktop:local-mcp)
//   3. Per-action consent dialog (native dialog.showMessageBox)
//   4. Guardrail filter (Wave 7) on all tool inputs/outputs
//   5. Audit log every invocation to central sink
//
// Architecture: Option B — companion process that manages stdio MCP servers;
// desktop exposes listLocalTools + invokeLocalTool via preload.ts contextBridge.
//
// See: desktop/src/mcp-bridge.ts (scaffold only; no execution code until sign-off)
