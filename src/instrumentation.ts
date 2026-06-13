import * as Sentry from "@sentry/nextjs";
import { IS_VERCEL_ENV } from "lib/const";

export async function register() {
  // asafe-ai (ADR-0006): server/edge error tracking. No-op unless SENTRY_DSN is set, so local
  // dev and the pilot run unaffected until A Safe provides a DSN.
  if (process.env.SENTRY_DSN) {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV,
      tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? "0"),
    });
  }

  if (process.env.NEXT_RUNTIME === "nodejs") {
    // The web server can execute workflow runs in-process (e.g. the /api/v1
    // sessions endpoint fires runSessionByIdDetached). When a run parks at an
    // approval node, ts-edge re-throws an ApprovalPendingError on a DETACHED
    // promise that escapes our .catch and surfaces as a process-level
    // unhandledRejection. That is a normal pause (the session is already set to
    // awaiting_approval), not a fault — but on plain Node (EKS) an unhandled
    // rejection can tear down the process. Swallow exactly that signal here, the
    // same way scripts/agent-worker.ts does for the standalone worker.
    const { isApprovalPending } = await import(
      "lib/agent-platform/approval-error"
    );
    process.on("unhandledRejection", (reason) => {
      if (isApprovalPending(reason)) return;
      console.error("server unhandledRejection:", reason);
    });

    // Enable proxy support for undici (used by AI SDK) via HTTP_PROXY/HTTPS_PROXY env vars
    const proxyUrl =
      process.env.HTTPS_PROXY ||
      process.env.https_proxy ||
      process.env.HTTP_PROXY ||
      process.env.http_proxy;
    if (proxyUrl) {
      const { ProxyAgent, setGlobalDispatcher } = await import("undici");
      console.log(`[proxy] Using proxy for fetch requests: ${proxyUrl}`);
      setGlobalDispatcher(new ProxyAgent(proxyUrl));
    }
    // asafe-ai (ADR-0006): on EKS, migrations run as a Helm pre-deploy Job, so pods set
    // DISABLE_DB_MIGRATE_ON_BOOT=true to avoid concurrent migrations across replicas.
    // Local/docker-compose keeps the upstream migrate-on-boot default.
    if (!IS_VERCEL_ENV && process.env.DISABLE_DB_MIGRATE_ON_BOOT !== "true") {
      // run DB migration (skip on Vercel - migrations run separately)
      const runMigrate = await import("./lib/db/pg/migrate.pg").then(
        (m) => m.runMigrate,
      );
      await runMigrate().catch((e) => {
        console.error(e);
        process.exit(1);
      });
    }
    if (!IS_VERCEL_ENV) {
      // Init MCP manager on all environments.
      // Cached servers are available instantly; new servers connect in background.
      const initMCPManager = await import("./lib/ai/mcp/mcp-manager").then(
        (m) => m.initMCPManager,
      );
      await initMCPManager();
    }
  }
}

export const onRequestError = Sentry.captureRequestError;
