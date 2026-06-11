import { defineConfig, devices } from "@playwright/test";
import { config } from "dotenv";

// Load environment variables
if (process.env.CI) {
  config({ path: ".env.test" });
} else {
  config();
}

export default defineConfig({
  testDir: "./tests",
  timeout: 60 * 1000, // Increased timeout for agent operations
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 4 : 3,
  // Removed maxFailures - let tests run to completion and fail properly
  reporter: process.env.CI
    ? [
        ["html", { open: "never", outputFolder: "playwright-report" }],
        ["list"],
        ["json", { outputFile: "test-results/.last-run.json" }],
      ]
    : [["html"], ["list"]],
  use: {
    baseURL: process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3001",
    ignoreHTTPSErrors: true,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    ...devices["Desktop Chrome"],
  },

  globalSetup: "./tests/lifecycle/setup.global.ts",
  globalTeardown: "./tests/lifecycle/teardown.global.ts",

  projects: [
    // Standard test setup - seeds users before running tests
    {
      name: "setup",
      testMatch: /.*auth-states\.setup\.ts/,
      // Auth state setups must run serially — parallel sign-ins overwhelm the dev server
      fullyParallel: false,
    },

    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
      },
      dependencies: ["setup"],
      testMatch: /.*\.spec\.ts/,
      testIgnore: [/.*\.setup\.ts/],
    },
  ],

  webServer: [
    {
      command: "pnpm start",
      url: process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3001",
      reuseExistingServer: !process.env.CI,
      timeout: 180 * 1000, // 3 minutes for build and start
      stdout: "pipe",
      stderr: "pipe",
    },
    {
      // Remote MCP fixture (streamable HTTP) — production builds enforce the
      // cloud remote-only posture, so MCP specs create servers against this.
      command: "node tests/fixtures/test-mcp-http-server.mjs",
      url: `http://localhost:${process.env.E2E_MCP_PORT || 3007}/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 30 * 1000,
      stdout: "pipe",
      stderr: "pipe",
    },
  ],
});
