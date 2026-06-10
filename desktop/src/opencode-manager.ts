/**
 * @asafe-ai/desktop — governed opencode lifecycle manager
 *
 * Task #25 (next-gen platform blueprint): the desktop embeds the open-source
 * opencode server as a *governed coding surface*. The desktop does NOT talk to
 * model providers directly — the spawned opencode process is configured so all
 * of its model calls route through the asafe OpenRouter gateway, inheriting
 * the same entitlements, budgets, and audit as chat (ADR-0009 / blueprint
 * "Desktop role" section).
 *
 * GATE (ADR-0010 — default deny):
 *   This module never activates on its own. Activation requires BOTH:
 *     1. env ASAFE_DESKTOP_OPENCODE=1  (explicit local opt-in)
 *     2. the policy object returned by defineOpencodePolicy() allowing spawn
 *   Mirrors the mcp-bridge sign-off convention: no local execution surface is
 *   enabled by default; a signed policy plane (server-distributed, verified)
 *   will replace the env opt-in before GA.
 *
 * SDK / spawn contract (researched against opencode.ai docs + npm registry,
 * @opencode-ai/sdk@1.17.x):
 *   - CLI: `opencode serve [--port <n>] [--hostname <str>]`
 *     defaults: port 4096, hostname 127.0.0.1. `--port 0` requests an
 *     OS-assigned ephemeral port; the chosen URL is announced on stdout
 *     (we parse `http://127.0.0.1:<port>` tolerantly — see PORT_PATTERNS).
 *   - Config: highest-precedence runtime override is the
 *     OPENCODE_CONFIG_CONTENT env var (inline JSON, merged over global/project
 *     config). We use it so governance config never touches the user's
 *     ~/.config/opencode or project opencode.json.
 *   - Custom provider: `provider.<id>` with npm "@ai-sdk/openai-compatible",
 *     options.baseURL + options.apiKey "{env:VAR}" indirection.
 *   - The renderer/SDK side (future chat UI work) connects with
 *     createOpencodeClient({ baseUrl: getEndpoint() }).
 *
 * ───────────────────────────────────────────────────────────────────────────
 * GATEWAY CONTRACT (documented here because the web endpoint does NOT exist
 * yet — this is the contract the web side must implement):
 *
 *   Endpoint   : `${ASAFE_APP_URL}/api/gateway/openrouter`
 *   Protocol   : OpenAI-compatible (chat completions surface; opencode's
 *                provider plugin is @ai-sdk/openai-compatible, i.e. it calls
 *                `POST <baseURL>/chat/completions` with streaming SSE).
 *   Auth       : `Authorization: Bearer <ASAFE_SESSION_TOKEN>` — the user's
 *                asafe web session token, passed through to the spawned
 *                process as the ASAFE_SESSION_TOKEN env var and referenced
 *                from config via "{env:ASAFE_SESSION_TOKEN}". The gateway
 *                validates the session, NOT a provider API key. Desktop never
 *                holds provider credentials.
 *   Models     : resolved server-side through the layered model entitlements
 *                (org base + team overrides). The gateway rejects models the
 *                session's user/team is not entitled to; the desktop ships an
 *                empty model map until the gateway exposes a model listing.
 *   Budgets    : usage is metered against the same org/team budgets as chat
 *                (ADR-0003); audit events carry originSurface "opencode".
 * ───────────────────────────────────────────────────────────────────────────
 *
 * Lifecycle: stopped → starting → running, with an unavailable terminal state
 * when the gate is closed or no binary is found, and error after the restart
 * cap (3) is exhausted. stop() / app quit sends SIGTERM (SIGKILL after 5s).
 *
 * This module is intentionally electron-free (node builtins only) so it can
 * be smoke-tested in isolation: `node -e "import('./dist/opencode-manager.js')"`.
 */

import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// ---------------------------------------------------------------------------
// Policy (ADR-0010 sign-off convention — default deny)
// ---------------------------------------------------------------------------

export interface OpencodePolicy {
  /** Whether spawning the local opencode server is permitted at all. */
  allowSpawn: boolean;
  /** Human-readable reason, surfaced in status messages and logs. */
  reason: string;
}

/**
 * Policy stub mirroring mcp-bridge's sign-off convention (ADR-0010).
 *
 * DEFAULT DENY: without the explicit ASAFE_DESKTOP_OPENCODE=1 opt-in the
 * policy denies spawn and the manager never touches the filesystem or spawns
 * anything. A signed, server-distributed policy plane will replace this env
 * check before GA — at that point the env var becomes a *local* opt-in that
 * is ANDed with the signed policy, never a bypass.
 */
export function defineOpencodePolicy(
  env: NodeJS.ProcessEnv = process.env,
): OpencodePolicy {
  if (env["ASAFE_DESKTOP_OPENCODE"] !== "1") {
    return {
      allowSpawn: false,
      reason:
        "Governed coding is disabled by default (ADR-0010). " +
        "Set ASAFE_DESKTOP_OPENCODE=1 to opt in on this machine.",
    };
  }
  return {
    allowSpawn: true,
    reason:
      "Local opt-in via ASAFE_DESKTOP_OPENCODE=1 " +
      "(interim gate until the signed policy plane ships — ADR-0010).",
  };
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type OpencodeStatus =
  | "stopped"
  | "starting"
  | "running"
  | "unavailable"
  | "error";

export interface OpencodeStatusSnapshot {
  status: OpencodeStatus;
  /** Human-readable detail (why unavailable, restart counts, etc.). */
  message: string;
  /** http://127.0.0.1:<port> when running, otherwise null. */
  endpoint: string | null;
  pid: number | null;
  restarts: number;
}

interface OpencodeManagerOptions {
  env?: NodeJS.ProcessEnv;
  policy?: OpencodePolicy;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_RESTARTS = 3;
const STARTUP_TIMEOUT_MS = 15_000;
const SHUTDOWN_GRACE_MS = 5_000;

/**
 * Tolerant patterns for the server-announce line. opencode prints the chosen
 * URL on stdout when it binds (format observed as `opencode server listening
 * on http://127.0.0.1:<port>`; exact wording is not a documented contract, so
 * we match any loopback URL and fall back to a "listening …<port>" phrase).
 */
const PORT_PATTERNS: RegExp[] = [
  /https?:\/\/(?:127\.0\.0\.1|localhost|0\.0\.0\.0):(\d{1,5})/i,
  /listening[^\d]*(\d{2,5})/i,
];

// ---------------------------------------------------------------------------
// Binary discovery
// ---------------------------------------------------------------------------

const WINDOWS_EXTS = [".exe", ".cmd", ".bat", ""];

function isExecutable(candidate: string): boolean {
  try {
    const stat = fs.statSync(candidate);
    if (!stat.isFile()) return false;
    if (process.platform !== "win32") {
      fs.accessSync(candidate, fs.constants.X_OK);
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Locate the opencode binary: ASAFE_OPENCODE_BIN wins, else scan PATH
 * (which/where equivalent, done in-process so discovery never spawns).
 * Returns null when not found — callers map that to status "unavailable".
 */
export function locateOpencodeBinary(
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const explicit = env["ASAFE_OPENCODE_BIN"];
  if (explicit) {
    return isExecutable(explicit) ? explicit : null;
  }

  const pathVar = env["PATH"] ?? env["Path"] ?? "";
  const exts = process.platform === "win32" ? WINDOWS_EXTS : [""];
  for (const dir of pathVar.split(path.delimiter)) {
    if (!dir) continue;
    for (const ext of exts) {
      const candidate = path.join(dir, `opencode${ext}`);
      if (isExecutable(candidate)) return candidate;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Governance config for the spawned process
// ---------------------------------------------------------------------------

/**
 * Build the scoped opencode config (injected via OPENCODE_CONFIG_CONTENT,
 * the highest-precedence runtime override) pointing the provider at the
 * asafe gateway. See the GATEWAY CONTRACT block at the top of this file.
 */
function buildGovernedConfig(appUrl: string): string {
  const gatewayBaseUrl = `${appUrl.replace(/\/+$/, "")}/api/gateway/openrouter`;
  return JSON.stringify({
    $schema: "https://opencode.ai/config.json",
    provider: {
      asafe: {
        npm: "@ai-sdk/openai-compatible",
        name: "Asafe Gateway (OpenRouter)",
        options: {
          baseURL: gatewayBaseUrl,
          // Session-token auth, not a provider key: the gateway validates the
          // user's asafe session and resolves entitlements server-side.
          apiKey: "{env:ASAFE_SESSION_TOKEN}",
        },
        // Models are resolved through entitlements at the gateway. Once the
        // gateway exposes its entitled-model listing, this map is populated
        // dynamically; until then opencode sees the provider but no models.
        models: {},
      },
    },
  });
}

// ---------------------------------------------------------------------------
// OpencodeManager
// ---------------------------------------------------------------------------

export class OpencodeManager {
  private readonly env: NodeJS.ProcessEnv;
  private readonly policy: OpencodePolicy;

  private status: OpencodeStatus = "stopped";
  private message = "Not started.";
  private child: ChildProcess | null = null;
  private port: number | null = null;
  private restarts = 0;
  private stopping = false;

  constructor(options: OpencodeManagerOptions = {}) {
    this.env = options.env ?? process.env;
    this.policy = options.policy ?? defineOpencodePolicy(this.env);
    if (!this.gateOpen()) {
      // Surface the closed gate immediately, but stay in "stopped" — the
      // manager is inert, not broken. Nothing was probed or spawned.
      this.message = this.gateMessage();
    }
  }

  // -- public API -----------------------------------------------------------

  getStatus(): OpencodeStatusSnapshot {
    return {
      status: this.status,
      message: this.message,
      endpoint: this.getEndpoint(),
      pid: this.child?.pid ?? null,
      restarts: this.restarts,
    };
  }

  getEndpoint(): string | null {
    return this.status === "running" && this.port !== null
      ? `http://127.0.0.1:${this.port}`
      : null;
  }

  /**
   * Start the governed opencode server. Never throws — failures land in the
   * status snapshot ("unavailable" for gate/binary problems, "error" for
   * spawn/startup failures).
   */
  async start(): Promise<OpencodeStatusSnapshot> {
    try {
      if (this.status === "running" || this.status === "starting") {
        return this.getStatus();
      }

      if (!this.gateOpen()) {
        this.setState("stopped", this.gateMessage());
        return this.getStatus();
      }

      const binary = locateOpencodeBinary(this.env);
      if (!binary) {
        this.setState(
          "unavailable",
          "opencode binary not found. Install opencode (https://opencode.ai) " +
            "or set ASAFE_OPENCODE_BIN to its absolute path.",
        );
        return this.getStatus();
      }

      this.stopping = false;
      await this.spawnServer(binary);
      return this.getStatus();
    } catch (err) {
      // Belt and braces: start() must never reject.
      this.setState(
        "error",
        `Unexpected failure starting opencode: ${errMessage(err)}`,
      );
      return this.getStatus();
    }
  }

  /** Graceful stop: SIGTERM, escalate to SIGKILL after SHUTDOWN_GRACE_MS. */
  async stop(): Promise<OpencodeStatusSnapshot> {
    this.stopping = true;
    const child = this.child;
    if (child && child.exitCode === null && !child.killed) {
      await new Promise<void>((resolve) => {
        const killTimer = setTimeout(() => {
          try {
            child.kill("SIGKILL");
          } catch {
            // already gone
          }
        }, SHUTDOWN_GRACE_MS);
        child.once("exit", () => {
          clearTimeout(killTimer);
          resolve();
        });
        try {
          child.kill("SIGTERM");
        } catch {
          clearTimeout(killTimer);
          resolve();
        }
      });
    }
    this.child = null;
    this.port = null;
    this.restarts = 0;
    this.setState("stopped", "Stopped.");
    return this.getStatus();
  }

  // -- internals ------------------------------------------------------------

  private gateOpen(): boolean {
    return (
      this.env["ASAFE_DESKTOP_OPENCODE"] === "1" && this.policy.allowSpawn
    );
  }

  private gateMessage(): string {
    return `Governed coding gate closed: ${this.policy.reason}`;
  }

  private setState(status: OpencodeStatus, message: string): void {
    this.status = status;
    this.message = message;
    console.info(`[opencode] ${status}: ${message}`);
  }

  private spawnServer(binary: string): Promise<void> {
    this.setState("starting", `Spawning ${binary} serve…`);

    const appUrl = this.env["ASAFE_APP_URL"] ?? "http://localhost:3000";

    const child = spawn(
      binary,
      ["serve", "--port", "0", "--hostname", "127.0.0.1"],
      {
        cwd: os.homedir(),
        stdio: ["ignore", "pipe", "pipe"],
        env: {
          ...this.env,
          // Highest-precedence runtime config override — scoped to this child
          // only; never touches the user's global/project opencode config.
          OPENCODE_CONFIG_CONTENT: buildGovernedConfig(appUrl),
          // Session-token passthrough for the gateway provider ({env:…} ref).
          ASAFE_SESSION_TOKEN: this.env["ASAFE_SESSION_TOKEN"] ?? "",
        },
      },
    );
    this.child = child;

    return new Promise<void>((resolve) => {
      let settled = false;
      let announce = "";

      const settle = () => {
        if (settled) return true;
        settled = true;
        clearTimeout(startupTimer);
        return false;
      };

      const startupTimer = setTimeout(() => {
        if (settle()) return;
        this.setState(
          "error",
          `opencode did not announce a port within ${STARTUP_TIMEOUT_MS}ms.`,
        );
        try {
          child.kill("SIGTERM");
        } catch {
          // already gone
        }
        resolve();
      }, STARTUP_TIMEOUT_MS);

      const onOutput = (chunk: Buffer) => {
        announce += chunk.toString();
        for (const pattern of PORT_PATTERNS) {
          const match = pattern.exec(announce);
          const portStr = match?.[1];
          if (portStr) {
            const port = Number(portStr);
            if (port > 0 && port < 65_536) {
              if (settle()) return;
              this.port = port;
              this.setState(
                "running",
                `opencode serving at http://127.0.0.1:${port} (model calls via ${appUrl}/api/gateway/openrouter).`,
              );
              resolve();
              return;
            }
          }
        }
      };
      child.stdout?.on("data", onOutput);
      child.stderr?.on("data", onOutput);

      child.once("error", (err: NodeJS.ErrnoException) => {
        if (settle()) return;
        this.child = null;
        if (err.code === "ENOENT") {
          this.setState(
            "unavailable",
            `opencode binary vanished or is not executable (${binary}).`,
          );
        } else {
          this.setState("error", `Failed to spawn opencode: ${err.message}`);
        }
        resolve();
      });

      child.on("exit", (code, signal) => {
        const wasRunning = this.status === "running";
        this.child = null;
        this.port = null;

        if (this.stopping) {
          if (!settle()) resolve();
          return;
        }

        if (!settled) {
          // Exited before announcing a port — startup failure.
          settle();
          this.setState(
            "error",
            `opencode exited during startup (code ${code ?? "null"}, signal ${signal ?? "none"}).`,
          );
          resolve();
          return;
        }

        if (wasRunning) {
          // Unexpected crash — restart with a cap of MAX_RESTARTS.
          if (this.restarts < MAX_RESTARTS) {
            this.restarts += 1;
            this.setState(
              "starting",
              `opencode exited unexpectedly (code ${code ?? "null"}) — restart ${this.restarts}/${MAX_RESTARTS}.`,
            );
            void this.spawnServer(binary);
          } else {
            this.setState(
              "error",
              `opencode crashed ${MAX_RESTARTS} times — giving up. Check the binary and gateway config.`,
            );
          }
        }
      });
    });
  }
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
