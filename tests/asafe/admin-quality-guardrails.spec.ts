/**
 * E2E tests for W12 admin quality + guardrails pages.
 */

import { test, expect } from "@playwright/test";
import { TEST_USERS } from "../constants/test-users";

const BASE = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3001";

test.describe("Admin Quality dashboard (/admin/quality)", () => {
  test("admin can reach /admin/quality and sees the Quality heading", async ({
    browser,
  }) => {
    const ctx = await browser.newContext({
      storageState: TEST_USERS.admin.authFile,
    });
    const page = await ctx.newPage();

    await page.goto(`${BASE}/admin/quality`, { waitUntil: "networkidle" });

    // Page title or heading should contain "Quality"
    const heading = await page.getByRole("heading", { level: 1 }).first().textContent();
    expect(heading).toMatch(/quality/i);

    await ctx.close();
  });

  test("regular user is redirected/blocked from /admin/quality", async ({
    browser,
  }) => {
    const ctx = await browser.newContext({
      storageState: TEST_USERS.regular.authFile,
    });
    const page = await ctx.newPage();

    await page.goto(`${BASE}/admin/quality`, { waitUntil: "networkidle" });

    // The admin layout gates non-admins via requireAdminPermission() →
    // unauthorized(), which renders the Next.js unauthorized boundary at the
    // SAME url (no redirect). Assert the dashboard content is absent.
    await expect(
      page.getByText("Satisfaction rate", { exact: false }),
    ).not.toBeVisible();
    await expect(
      page.getByText(/unauthorized|forbidden|not authorized/i).first(),
    ).toBeVisible();

    await ctx.close();
  });

  test("editor user is redirected/blocked from /admin/quality", async ({
    browser,
  }) => {
    const ctx = await browser.newContext({
      storageState: TEST_USERS.editor.authFile,
    });
    const page = await ctx.newPage();

    await page.goto(`${BASE}/admin/quality`, { waitUntil: "networkidle" });

    await expect(
      page.getByText("Satisfaction rate", { exact: false }),
    ).not.toBeVisible();
    await expect(
      page.getByText(/unauthorized|forbidden|not authorized/i).first(),
    ).toBeVisible();

    await ctx.close();
  });

  test("quality page shows stat cards (thumbs up, thumbs down, satisfaction)", async ({
    browser,
  }) => {
    const ctx = await browser.newContext({
      storageState: TEST_USERS.admin.authFile,
    });
    const page = await ctx.newPage();

    await page.goto(`${BASE}/admin/quality`, { waitUntil: "networkidle" });

    // Three stat cards labelled Thumbs up / Thumbs down / Satisfaction rate.
    // (The previous `[class*="CardContent"]` selector never matched — shadcn's
    // CardContent does not include that string in its className.)
    await expect(page.getByText("Thumbs up", { exact: true })).toBeVisible();
    await expect(page.getByText("Thumbs down", { exact: true })).toBeVisible();
    await expect(
      page.getByText("Satisfaction rate", { exact: true }),
    ).toBeVisible();

    await ctx.close();
  });
});

test.describe("Admin Guardrails events (/admin/guardrails)", () => {
  test("admin can reach /admin/guardrails and sees the Guardrail heading", async ({
    browser,
  }) => {
    const ctx = await browser.newContext({
      storageState: TEST_USERS.admin.authFile,
    });
    const page = await ctx.newPage();

    await page.goto(`${BASE}/admin/guardrails`, { waitUntil: "networkidle" });

    const heading = await page.getByRole("heading", { level: 1 }).first().textContent();
    expect(heading).toMatch(/guardrail/i);

    await ctx.close();
  });

  test("regular user is redirected/blocked from /admin/guardrails", async ({
    browser,
  }) => {
    const ctx = await browser.newContext({
      storageState: TEST_USERS.regular.authFile,
    });
    const page = await ctx.newPage();

    await page.goto(`${BASE}/admin/guardrails`, { waitUntil: "networkidle" });

    // Non-admins hit the unauthorized boundary (rendered at the same url). The
    // guardrails log heading must be absent and the unauthorized notice present.
    await expect(
      page.getByRole("heading", { name: /guardrail/i }),
    ).not.toBeVisible();
    await expect(
      page.getByText(/unauthorized|forbidden|not authorized/i).first(),
    ).toBeVisible();

    await ctx.close();
  });

  test("guardrails page shows Blocked and Warned stat headings", async ({
    browser,
  }) => {
    const ctx = await browser.newContext({
      storageState: TEST_USERS.admin.authFile,
    });
    const page = await ctx.newPage();

    await page.goto(`${BASE}/admin/guardrails`, { waitUntil: "networkidle" });

    const content = await page.textContent("body");
    expect(content).toMatch(/blocked/i);
    expect(content).toMatch(/warned/i);

    await ctx.close();
  });
});

test.describe("Admin sidebar — Quality and Guardrails nav items", () => {
  test("admin sidebar has quality nav item at /admin", async ({ browser }) => {
    const ctx = await browser.newContext({
      storageState: TEST_USERS.admin.authFile,
    });
    const page = await ctx.newPage();

    await page.goto(`${BASE}/admin`, { waitUntil: "networkidle" });

    // Sidebar sub-items appear when on /admin/* routes
    const qualityLink = page.getByTestId("admin-sidebar-link-quality");
    await expect(qualityLink).toBeVisible();

    await ctx.close();
  });

  test("admin sidebar has guardrails nav item at /admin", async ({ browser }) => {
    const ctx = await browser.newContext({
      storageState: TEST_USERS.admin.authFile,
    });
    const page = await ctx.newPage();

    await page.goto(`${BASE}/admin`, { waitUntil: "networkidle" });

    const guardrailsLink = page.getByTestId("admin-sidebar-link-guardrails");
    await expect(guardrailsLink).toBeVisible();

    await ctx.close();
  });
});
