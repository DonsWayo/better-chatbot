import { resolve } from "path";

import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

/**
 * Opt-in real-LLM integration tier (costs real money — ~$0.01/run):
 *
 *   RUN_LLM_TESTS=1 pnpm test:llm
 *
 * - Only picks up `src/**\/*.llm.test.ts` (excluded from the default `pnpm test`).
 * - Every llm test file guards itself with `describe.skipIf(!RUN)` so the suite
 *   SKIPS (not fails) without OPENROUTER_API_KEY + RUN_LLM_TESTS=1.
 * - The setup file is src/lib/load-env.ts, which loads .env/.env.local into
 *   process.env before the test modules are evaluated.
 * - Never run in CI by default. See content/docs/development/testing.mdx.
 */
export default defineConfig({
  plugins: [tsconfigPaths()],
  resolve: {
    alias: {
      // server-only throws outside Next.js; stub with empty module in tests
      "server-only": resolve(__dirname, "src/lib/__mocks__/server-only.ts"),
    },
  },
  test: {
    include: ["src/**/*.llm.test.ts"],
    setupFiles: ["./src/lib/load-env.ts"],
    testTimeout: 30_000,
    // Real API calls: run test files serially to keep rate limits + spend sane.
    fileParallelism: false,
  },
});
