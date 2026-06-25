/**
 * @asafe-ai/desktop — Electron preload script
 *
 * Runs in an isolated context (contextIsolation:true).
 * Exposes a minimal, typed surface to the renderer via contextBridge.
 *
 * NOTE: this file is .cts on purpose — Electron loads preload scripts via
 * require(), and package.json has "type":"module", so the preload must be
 * emitted as CommonJS with a .cjs extension (dist/preload.cjs). Keep it .cts.
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

    /** Create a new opencode coding session. Returns { id } and other session metadata. */
    sessionCreate: (): Promise<{ id: string }> =>
      ipcRenderer.invoke("opencode:session-create"),

    /** List all active opencode sessions for the current workspace. */
    sessionList: (): Promise<unknown[]> =>
      ipcRenderer.invoke("opencode:session-list"),

    /** Send a user message to an active opencode session. */
    prompt: (id: string, text: string): Promise<unknown> =>
      ipcRenderer.invoke("opencode:prompt", { id, text }),

    /** Abort an in-progress opencode session response. */
    abort: (id: string): Promise<boolean> =>
      ipcRenderer.invoke("opencode:abort", { id }),

    /** Get the current file modification status from opencode. */
    fileStatus: (): Promise<unknown[]> =>
      ipcRenderer.invoke("opencode:file-status"),

    /** Full-text search across the workspace via opencode. */
    findText: (query: string): Promise<unknown[]> =>
      ipcRenderer.invoke("opencode:find-text", { query }),

    /**
     * Reply to a pending opencode permission request.
     * response: "once" → allow this call only, "always" → approve the pattern,
     *           "reject" → deny and abort the tool call.
     */
    replyPermission: (
      sessionId: string,
      permissionId: string,
      response: "once" | "always" | "reject",
    ): Promise<boolean> =>
      ipcRenderer.invoke("opencode:permission-reply", {
        sessionId,
        permissionId,
        response,
      }),
  },

  /**
   * Subscribe to the opencode real-time event stream forwarded from the main
   * process. Returns an unsubscribe function — call it to stop listening.
   */
  onOpencodeEvent: (
    callback: (event: { type: string; properties: Record<string, unknown> }) => void,
  ): (() => void) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      evt: { type: string; properties: Record<string, unknown> },
    ) => callback(evt);
    ipcRenderer.on("opencode:event", listener);
    return () => ipcRenderer.removeListener("opencode:event", listener);
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
    sessionCreate: () => Promise<{ id: string }>;
    sessionList: () => Promise<unknown[]>;
    prompt: (id: string, text: string) => Promise<unknown>;
    abort: (id: string) => Promise<boolean>;
    fileStatus: () => Promise<unknown[]>;
    findText: (query: string) => Promise<unknown[]>;
    replyPermission: (
      sessionId: string,
      permissionId: string,
      response: "once" | "always" | "reject",
    ) => Promise<boolean>;
  };
  onOpencodeEvent: (
    callback: (event: {
      type: string;
      properties: Record<string, unknown>;
    }) => void,
  ) => () => void;
  // Wave 10 v2 (pending Security sign-off):
  // listLocalTools?: () => Promise<LocalMcpTool[]>;
  // invokeLocalTool?: (toolName: string, args: Record<string, unknown>) => Promise<unknown>;
}

declare global {
  interface Window {
    asafeDesktop?: AsafeDesktopApi;
  }
}
