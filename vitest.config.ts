import { defineConfig } from "vitest/config";
import { resolve } from "path";

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
    exclude: ["**/tests/**", "**/node_modules/**"],
  },
});
