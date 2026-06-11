import { resolve } from "path";
import { defineConfig } from "vitest/config";

import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  resolve: {
    alias: {
      // server-only throws outside Next.js; stub with empty module in tests
      "server-only": resolve(__dirname, "src/lib/__mocks__/server-only.ts"),
    },
  },
  test: {
    // *.llm.test.ts is the opt-in real-LLM tier (pnpm test:llm, vitest.llm.config.ts)
    exclude: ["**/tests/**", "**/node_modules/**", "**/*.llm.test.ts"],
  },
});
