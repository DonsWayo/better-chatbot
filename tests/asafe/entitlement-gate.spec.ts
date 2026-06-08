/**
 * E2E tests for the asafe-ai entitlement gate (ADR-0009).
 *
 * Regular users (role="user") are locked to the "Auto" model — the model
 * selector button must be absent or disabled. Admins and editors can freely
 * open and interact with the model picker.
 *
 * Each test creates its own browser context so the suite is fully parallel-safe.
 */

import { test, expect } from "@playwright/test";
import { TEST_USERS } from "../constants/test-users";

// ---------------------------------------------------------------------------
// Group 1: UI entitlement gate
// ---------------------------------------------------------------------------

test.describe("Entitlement Gate — Model Picker UI", () => {
  test("regular user: model-selector-button is absent or disabled on homepage", async ({
    browser,
  }) => {
    const ctx = await browser.newContext({
      storageState: TEST_USERS.regular.authFile,
    });
    const page = await ctx.newPage();
    await page.goto("/", { waitUntil: "networkidle" });

    const btn = page.getByTestId("model-selector-button");

    // The button must either not exist in the DOM at all, or exist but be
    // disabled — it must never be an enabled, interactive picker.
    const isVisible = await btn.isVisible().catch(() => false);
    if (isVisible) {
      // If visible, it must be disabled (aria-disabled or disabled attr)
      const isDisabled =
        (await btn.getAttribute("disabled")) !== null ||
        (await btn.getAttribute("aria-disabled")) === "true";
      expect(
        isDisabled,
        "model-selector-button is visible but must be disabled for a regular user",
      ).toBe(true);
    }
    // If not visible — that satisfies the gate requirement as well.

    await ctx.close();
  });

  test("admin user: model-selector-button is visible and clickable", async ({
    browser,
  }) => {
    const ctx = await browser.newContext({
      storageState: TEST_USERS.admin.authFile,
    });
    const page = await ctx.newPage();
    await page.goto("/", { waitUntil: "networkidle" });

    const btn = page.getByTestId("model-selector-button");
    await expect(btn).toBeVisible({ timeout: 10_000 });

    // Must not be disabled
    await expect(btn).toBeEnabled();

    await ctx.close();
  });

  test("editor user: model-selector-button is visible", async ({ browser }) => {
    const ctx = await browser.newContext({
      storageState: TEST_USERS.editor.authFile,
    });
    const page = await ctx.newPage();
    await page.goto("/", { waitUntil: "networkidle" });

    await expect(page.getByTestId("model-selector-button")).toBeVisible({
      timeout: 10_000,
    });

    await ctx.close();
  });

  test("regular user: selected-model-name shows 'Auto' (fixed label, not a free-choice picker)", async ({
    browser,
  }) => {
    const ctx = await browser.newContext({
      storageState: TEST_USERS.regular.authFile,
    });
    const page = await ctx.newPage();
    await page.goto("/", { waitUntil: "networkidle" });

    // The label that surfaces the active model must be present and read "Auto"
    // (or a close variant). If the element doesn't exist the gate is enforced
    // by hiding it entirely — check for that alternative as well.
    const label = page.getByTestId("selected-model-name");
    const labelVisible = await label.isVisible().catch(() => false);

    if (labelVisible) {
      const text = (await label.textContent()) ?? "";
      expect(
        text.toLowerCase(),
        `expected "auto" label for regular user but got "${text}"`,
      ).toMatch(/auto/i);
    }
    // If the label is not visible either the whole selector is hidden (fine)
    // or only the button is hidden. Both satisfy the entitlement requirement.

    await ctx.close();
  });

  test("admin user: opening model selector shows the popover with model options", async ({
    browser,
  }) => {
    const ctx = await browser.newContext({
      storageState: TEST_USERS.admin.authFile,
    });
    const page = await ctx.newPage();
    await page.goto("/", { waitUntil: "networkidle" });

    const btn = page.getByTestId("model-selector-button");
    await expect(btn).toBeVisible({ timeout: 10_000 });
    await btn.click();

    const popover = page.getByTestId("model-selector-popover");
    await expect(popover).toBeVisible({ timeout: 5_000 });

    // Popover must contain at least one model option
    const options = page.locator('[data-testid^="model-option-"]');
    const count = await options.count();
    expect(count, "no model options found in the popover for admin").toBeGreaterThan(0);

    // Dismiss
    await page.keyboard.press("Escape");

    await ctx.close();
  });

  test("regular user: model-selector-popover never becomes visible", async ({
    browser,
  }) => {
    const ctx = await browser.newContext({
      storageState: TEST_USERS.regular.authFile,
    });
    const page = await ctx.newPage();
    await page.goto("/", { waitUntil: "networkidle" });

    const btn = page.getByTestId("model-selector-button");
    const btnVisible = await btn.isVisible().catch(() => false);

    if (btnVisible) {
      // Even if the button is somehow rendered, clicking a disabled button
      // must NOT open the popover.
      await btn.click({ force: true });
      await page.waitForTimeout(500);
    }

    const popover = page.getByTestId("model-selector-popover");
    await expect(popover).not.toBeVisible();

    await ctx.close();
  });
});

// ---------------------------------------------------------------------------
// Group 2: API entitlement enforcement
// ---------------------------------------------------------------------------

test.describe("Entitlement Gate — Chat API", () => {
  /**
   * A regular user posting an explicit model to /api/chat should NOT receive a
   * 401 or 403 from the entitlement gate. The server is expected to either
   * silently override the requested model with "Auto" (200 / streaming) or
   * return an upstream error (402/429). A 401 or 403 would indicate the gate
   * is blocking the chat request entirely, which is incorrect behaviour.
   */
  test("regular user: POST /api/chat with explicit model is not blocked by auth (200 or quota error, not 401/403)", async ({
    browser,
  }) => {
    const ctx = await browser.newContext({
      storageState: TEST_USERS.regular.authFile,
    });
    const page = await ctx.newPage();

    const response = await page.request.post("/api/chat", {
      headers: { "Content-Type": "application/json" },
      data: {
        id: `e2e-entitlement-${Date.now()}`,
        chatModel: {
          provider: "openrouter",
          model: "openai/gpt-4o",
        },
        message: {
          id: `msg-${Date.now()}`,
          role: "user",
          parts: [{ type: "text", text: "ping" }],
        },
        toolChoice: "none",
        allowedAppDefaultToolkit: [],
        allowedMcpServers: [],
        mentions: [],
        attachments: [],
      },
    });

    const status = response.status();

    // 401 / 403 from the entitlement gate would be a bug — the chat endpoint
    // should accept the request from an authenticated user regardless of role
    // and either stream a response (200) or reject on quota/billing (402/429).
    expect(
      [401, 403],
      `Expected chat request to be accepted by the server (not blocked at entitlement level), but got ${status}`,
    ).not.toContain(status);

    await ctx.close();
  });

  /**
   * Admin user posting to /api/chat should always succeed at the auth layer.
   */
  test("admin user: POST /api/chat is accepted (not 401/403)", async ({
    browser,
  }) => {
    const ctx = await browser.newContext({
      storageState: TEST_USERS.admin.authFile,
    });
    const page = await ctx.newPage();

    const response = await page.request.post("/api/chat", {
      headers: { "Content-Type": "application/json" },
      data: {
        id: `e2e-entitlement-admin-${Date.now()}`,
        chatModel: {
          provider: "openrouter",
          model: "openai/gpt-4o",
        },
        message: {
          id: `msg-admin-${Date.now()}`,
          role: "user",
          parts: [{ type: "text", text: "ping" }],
        },
        toolChoice: "none",
        allowedAppDefaultToolkit: [],
        allowedMcpServers: [],
        mentions: [],
        attachments: [],
      },
    });

    const status = response.status();
    expect(
      [401, 403],
      `Admin chat request should not be blocked at entitlement level, but got ${status}`,
    ).not.toContain(status);

    await ctx.close();
  });

  /**
   * GET /api/chat/models: regular users should receive a models list that
   * either contains only "auto" or returns a non-forbidden response. The key
   * invariant is the endpoint does not 403.
   */
  test("regular user: GET /api/chat/models does not return 403", async ({
    browser,
  }) => {
    const ctx = await browser.newContext({
      storageState: TEST_USERS.regular.authFile,
    });
    const page = await ctx.newPage();

    const response = await page.request.get("/api/chat/models");
    expect(response.status()).not.toBe(403);

    await ctx.close();
  });
});
