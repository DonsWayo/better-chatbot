// Agent Platform #22 — detached worker entrypoint.
//
// Run with:  pnpm worker:agents
//
// The package.json script sets NODE_OPTIONS=--conditions=react-server so the
// `import "server-only"` guards inside src/lib resolve to the react-server
// no-op build instead of throwing (same condition Next.js itself uses for
// server modules). Env bootstrapping mirrors scripts/db-migrate.ts.

import "load-env";

const intervalMs = Number(process.env.AGENT_WORKER_INTERVAL_MS ?? "5000");

const { startWorkerLoop } = await import("lib/agent-platform/worker");

console.info(`🤖 agent worker starting (tick interval ${intervalMs}ms)`);

const loop = startWorkerLoop({
  intervalMs,
  onTick: (result) => {
    if (result.scheduled || result.executed || result.failed) {
      console.info(
        `tick: scheduled=${result.scheduled} executed=${result.executed} failed=${result.failed}`,
      );
    }
  },
});

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.info(`received ${signal} — stopping agent worker (graceful)`);
  // stop() resolves once any in-flight tick has finished.
  await loop.stop();
  console.info("agent worker stopped");
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
