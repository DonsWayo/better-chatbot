/**
 * Slim type definitions for opencode SDK events forwarded from the Electron
 * main process. The main process holds the full @opencode-ai/sdk client; the
 * renderer only receives serialised events over IPC and needs these shapes to
 * build UIMessage state.
 */

export type OpencodeEvent = {
  type: string;
  properties: Record<string, any>;
};

export type OpencodeSessionStatus = "idle" | "running" | "error";

/** Shape returned by opencode:session-create */
export type OpencodeSession = {
  id: string;
  [key: string]: unknown;
};

/**
 * Minimal typing of window.asafeDesktop for the web-app side (full type
 * lives in desktop/src/preload.cts which is not included in the web tsconfig).
 * Only the opencode surface and onOpencodeEvent are needed here.
 */
export interface AsafeDesktopOpencode {
  status: () => Promise<{ status: string; message: string; endpoint: string | null }>;
  start: () => Promise<{ status: string; message: string; endpoint: string | null }>;
  stop: () => Promise<{ status: string; message: string; endpoint: string | null }>;
  sessionCreate: () => Promise<OpencodeSession>;
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
}

export interface AsafeDesktopApi {
  isDesktop: true;
  platform: string;
  version: string;
  opencode: AsafeDesktopOpencode;
  onOpencodeEvent: (
    callback: (event: OpencodeEvent) => void,
  ) => () => void;
}

declare global {
  interface Window {
    asafeDesktop?: AsafeDesktopApi;
  }
}
