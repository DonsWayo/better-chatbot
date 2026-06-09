/**
 * @asafe-ai/desktop — Electron preload script
 *
 * Runs in an isolated context (contextIsolation:true).
 * Exposes a minimal, typed surface to the renderer via contextBridge.
 *
 * DO NOT expose Node.js APIs or electron internals directly to the renderer.
 * Every new capability requires deliberate review here.
 */

import { contextBridge, ipcRenderer } from "electron";

// ---------------------------------------------------------------------------
// Public API surface exposed to the web app (window.asafeDesktop)
// ---------------------------------------------------------------------------

contextBridge.exposeInMainWorld("asafeDesktop", {
  /** True when running inside the desktop app — the web UI can feature-flag on this. */
  isDesktop: true as const,

  /** OS platform — used for platform-specific UX hints. */
  platform: process.platform,

  /** Electron version string. */
  version: process.versions["electron"] ?? "unknown",

  // --------------------------------------------------------------------------
  // Native file dialogs
  // --------------------------------------------------------------------------

  /** Open a native file picker. Returns {canceled, filePaths} (Electron API shape). */
  openFile: (
    options?: Partial<Electron.OpenDialogOptions>,
  ): Promise<{ canceled: boolean; filePaths: string[] }> =>
    ipcRenderer.invoke("dialog:openFile", options ?? {}),

  /** Open a native save dialog. Returns {canceled, filePath}. */
  saveFile: (
    options?: Partial<Electron.SaveDialogOptions>,
  ): Promise<{ canceled: boolean; filePath: string | undefined }> =>
    ipcRenderer.invoke("dialog:saveFile", options ?? {}),

  // --------------------------------------------------------------------------
  // Native notifications
  // --------------------------------------------------------------------------

  /** Show a native OS notification. */
  notify: (title: string, body: string): Promise<void> =>
    ipcRenderer.invoke("notify", { title, body }),

  // --------------------------------------------------------------------------
  // SSO deep-link relay
  //
  // The main process calls webContents.send("deep-link", url) when an
  // asafe:// URL activates the app. Subscribe here to complete OAuth.
  // --------------------------------------------------------------------------

  /** Register a listener for incoming deep-link URLs (e.g. asafe://auth/callback?…). */
  onDeepLink: (callback: (url: string) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, url: string) =>
      callback(url);
    ipcRenderer.on("deep-link", listener);
    return () => ipcRenderer.removeListener("deep-link", listener);
  },

  // --------------------------------------------------------------------------
  // Wave 10 v2 — local stdio MCP bridge (NOT YET ENABLED)
  //
  // These will be added once Security sign-off is obtained (ADR-0010).
  // Stub types are declared below so TypeScript consumers know what's coming.
  //
  //   listLocalTools: (): Promise<LocalMcpTool[]> =>
  //     ipcRenderer.invoke("mcp:list-tools"),
  //
  //   invokeLocalTool: (toolName: string, args: Record<string, unknown>) =>
  //     ipcRenderer.invoke("mcp:invoke-tool", toolName, args),
  //
  // Both invoke handlers in main.ts check entitlements, display a consent
  // dialog, and pass through Wave 7 guardrails before executing.
  // --------------------------------------------------------------------------
} satisfies AsafeDesktopApi);

// ---------------------------------------------------------------------------
// Type declarations
// ---------------------------------------------------------------------------

export interface LocalMcpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface AsafeDesktopApi {
  isDesktop: true;
  platform: NodeJS.Platform;
  version: string;
  openFile: (
    options?: Partial<Electron.OpenDialogOptions>,
  ) => Promise<{ canceled: boolean; filePaths: string[] }>;
  saveFile: (
    options?: Partial<Electron.SaveDialogOptions>,
  ) => Promise<{ canceled: boolean; filePath: string | undefined }>;
  notify: (title: string, body: string) => Promise<void>;
  onDeepLink: (callback: (url: string) => void) => () => void;
  // Wave 10 v2 (pending Security sign-off):
  // listLocalTools?: () => Promise<LocalMcpTool[]>;
  // invokeLocalTool?: (toolName: string, args: Record<string, unknown>) => Promise<unknown>;
}

declare global {
  interface Window {
    asafeDesktop?: AsafeDesktopApi;
  }
}
