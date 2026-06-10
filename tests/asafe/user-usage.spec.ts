/**
 * E2E tests for W3 self-service usage view (/settings).
 */

import { test, expect } from "@playwright/test";
import { TEST_USERS } from "../constants/test-users";

const BASE = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3001";

test.describe("User self-service usage view (/settings)", () => {
  test("regular user can reach /settings and sees usage section", async ({
    browser,
  }) => {
    const ctx = await browser.newContext({
      storageState: TEST_USERS.regular.authFile,
    });
    const page = await ctx.newPage();

    // The settings hub is now tabbed: the self-service usage view lives at
    // /settings/usage (the bare /settings redirects to /settings/general).
    await page.goto(`${BASE}/settings/usage`, { waitUntil: "networkidle" });

    // Page should load
    await expect(page).not.toHaveURL(/login|unauthorized/);

    // Usage section should be present
    const usageSection = page.getByTestId("my-usage-section");
    await expect(usageSection).toBeVisible();

    await ctx.close();
  });

  test("settings page has usage, tokens, and requests cards when data loads", async ({
    browser,
  }) => {
    const ctx = await browser.newContext({
      storageState: TEST_USERS.regular.authFile,
    });
    const page = await ctx.newPage();

    await page.goto(`${BASE}/settings/usage`, { waitUntil: "networkidle" });

    // Wait for loading to complete (spinner gone)
    await page.waitForTimeout(1000);

    const usageSection = page.getByTestId("my-usage-section");
    await expect(usageSection).toBeVisible();

    // Check body contains relevant cost/token labels
    const content = await page.textContent("body");
    expect(content).toMatch(/Cost|Tokens|Requests/);

    await ctx.close();
  });

  test("settings page has data & privacy section", async ({ browser }) => {
    const ctx = await browser.newContext({
      storageState: TEST_USERS.regular.authFile,
    });
    const page = await ctx.newPage();

    await page.goto(`${BASE}/settings/data`, { waitUntil: "networkidle" });

    const content = await page.textContent("body");
    expect(content).toMatch(/Data.*Privacy|Privacy.*Data|data portability/i);

    await ctx.close();
  });

  test("GET /api/user/usage returns 401 for unauthenticated request", async ({
    request,
  }) => {
    const res = await request.get(`${BASE}/api/user/usage`);
    expect(res.status()).toBe(401);
  });

  test("GET /api/user/usage returns 200 for authenticated user", async ({
    browser,
  }) => {
    const ctx = await browser.newContext({
      storageState: TEST_USERS.regular.authFile,
    });
    const page = await ctx.newPage();

    const res = await page.request.get(`${BASE}/api/user/usage`);
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body).toHaveProperty("summary");
    expect(body).toHaveProperty("byModel");
    expect(body).toHaveProperty("budget");
    expect(body.summary).toHaveProperty("totalCostUsd");
    expect(body.summary).toHaveProperty("requestCount");
    expect(Array.isArray(body.byModel)).toBe(true);

    await ctx.close();
  });

  test("admin user can also access settings and usage view", async ({
    browser,
  }) => {
    const ctx = await browser.newContext({
      storageState: TEST_USERS.admin.authFile,
    });
    const page = await ctx.newPage();

    await page.goto(`${BASE}/settings/usage`, { waitUntil: "networkidle" });
    await expect(page).not.toHaveURL(/login|unauthorized/);

    const usageSection = page.getByTestId("my-usage-section");
    await expect(usageSection).toBeVisible();

    await ctx.close();
  });
});
