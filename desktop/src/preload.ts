/**
 * @asafe-ai/desktop — Electron preload script
 *
 * Runs in an isolated context (contextIsolation:true, sandbox:true).
 * Exposes a minimal, typed surface to the renderer via contextBridge.
 *
 * DO NOT expose Node.js APIs or electron internals directly to the renderer.
 * Every new capability requires deliberate review here.
 */

import { contextBridge } from "electron";

// ---------------------------------------------------------------------------
// Public API surface exposed to the web app (window.asafeDesktop)
// ---------------------------------------------------------------------------

contextBridge.exposeInMainWorld("asafeDesktop", {
  /** True when running inside the desktop app (feature-flag for the web UI). */
  isDesktop: true as const,

  /** OS platform string — used by the web UI for platform-specific UX hints. */
  platform: process.platform,

  /** Electron version string. */
  version: process.versions["electron"] ?? "unknown",

  // --------------------------------------------------------------------------
  // TODO (Wave 10 — local-MCP bridge IPC)
  //
  // When the main process gains the local stdio MCP bridge, expose it here
  // via ipcRenderer.invoke so the renderer can:
  //
  //   1. List available local MCP tools (filtered by entitlement, ADR-0009).
  //   2. Invoke a local tool, which triggers a per-action consent dialog in main
  //      (excessive-agency control, Wave 7 guardrails) before execution.
  //   3. Receive the tool result back as a structured JSON payload.
  //
  // Example sketch (DO NOT enable until Security sign-off per ADR-0010):
  //
  //   listLocalTools: (): Promise<LocalMcpTool[]> =>
  //     ipcRenderer.invoke("mcp:list-tools"),
  //
  //   invokeLocalTool: (
  //     toolName: string,
  //     args: Record<string, unknown>
  //   ): Promise<unknown> =>
  //     ipcRenderer.invoke("mcp:invoke-tool", toolName, args),
  //
  // Both handlers in main.ts must validate inputs, check entitlements, and
  // show a consent dialog BEFORE touching the local system.
  // --------------------------------------------------------------------------
} satisfies AsafeDesktopApi);

// ---------------------------------------------------------------------------
// Type declaration (kept in preload so web consumers can import if needed)
// ---------------------------------------------------------------------------

export interface AsafeDesktopApi {
  isDesktop: true;
  platform: NodeJS.Platform;
  version: string;
  // Wave 10 additions (see TODO above):
  // listLocalTools?: () => Promise<LocalMcpTool[]>;
  // invokeLocalTool?: (toolName: string, args: Record<string, unknown>) => Promise<unknown>;
}

// Augment the window type for the renderer (TypeScript consumers of the web bundle).
declare global {
  interface Window {
    asafeDesktop?: AsafeDesktopApi;
  }
}
