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
import type { OpencodeStatusSnapshot } from "./opencode-manager.js";

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
  // Governed coding (opencode) — task #25
  //
  // Lifecycle control for the local opencode server managed by the main
  // process. HARD-GATED (ADR-0010): unless ASAFE_DESKTOP_OPENCODE=1 and the
  // policy allows it, start() resolves with the gate-closed status and
  // nothing is spawned. Model calls of the spawned server route through the
  // asafe OpenRouter gateway (see src/opencode-manager.ts for the contract).
  // No chat UI yet — this is lifecycle + status only.
  // --------------------------------------------------------------------------

  opencode: {
    /** Current lifecycle status (stopped/starting/running/unavailable/error). */
    status: (): Promise<OpencodeStatusSnapshot> =>
      ipcRenderer.invoke("opencode:status"),

    /** Start the governed opencode server (no-op with explanatory status when gated). */
    start: (): Promise<OpencodeStatusSnapshot> =>
      ipcRenderer.invoke("opencode:start"),

    /** Stop the server (graceful SIGTERM). */
    stop: (): Promise<OpencodeStatusSnapshot> =>
      ipcRenderer.invoke("opencode:stop"),
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

export type { OpencodeStatusSnapshot } from "./opencode-manager.js";

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
  /** Governed coding (opencode) lifecycle — gated by ASAFE_DESKTOP_OPENCODE (ADR-0010). */
  opencode: {
    status: () => Promise<OpencodeStatusSnapshot>;
    start: () => Promise<OpencodeStatusSnapshot>;
    stop: () => Promise<OpencodeStatusSnapshot>;
  };
  // Wave 10 v2 (pending Security sign-off):
  // listLocalTools?: () => Promise<LocalMcpTool[]>;
  // invokeLocalTool?: (toolName: string, args: Record<string, unknown>) => Promise<unknown>;
}

declare global {
  interface Window {
    asafeDesktop?: AsafeDesktopApi;
  }
}
