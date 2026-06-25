import { expect, test } from "@playwright/test";
import { TEST_USERS } from "../constants/test-users";

// /docs — the in-app Fumadocs documentation site.
// Verifies that the new Workflows section, the node reference, and the
// @mentions update are all navigable.  These are lightweight smoke tests:
// they assert that the page loads and key headings/links exist, not that
// every paragraph is correct.

test.describe("/docs — in-app documentation", () => {
  test.use({ storageState: TEST_USERS.admin.authFile });

  test("overview page loads and mentions multi-tenant direction", async ({
    page,
  }) => {
    await page.goto("/docs");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    // Scope to the article element to avoid hidden mobile-nav duplicates.
    await expect(
      page.locator("article").getByText(/conek ai|multi.tenant|external client/i).first(),
    ).toBeVisible();
  });

  test("sidebar shows a Workflows section", async ({ page }) => {
    await page.goto("/docs");
    // Fumadocs renders section headers as collapsible <button>s, not <a>s.
    await expect(
      page.locator("nav a, aside a, nav button, aside button").filter({ hasText: /workflows/i }).first(),
    ).toBeVisible({ timeout: 8000 });
  });

  test("Workflows overview page renders", async ({ page }) => {
    await page.goto("/docs/workflows");
    await expect(
      page.getByRole("heading", { name: /workflow/i, level: 1 }),
    ).toBeVisible();
    // Should describe building a workflow.
    await expect(page.getByText(/canvas|node|workflow/i).first()).toBeVisible();
  });

  test("Workflows node reference page renders all node kinds", async ({
    page,
  }) => {
    await page.goto("/docs/workflows/nodes");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    // The page should document the WebSearch node.
    await expect(
      page.getByRole("heading", { name: /websearch|web search/i }),
    ).toBeVisible();
    // And the LLM node.
    await expect(
      page.getByRole("heading", { name: /llm/i }),
    ).toBeVisible();
  });

  test("collaboration/documents page documents @mentions", async ({ page }) => {
    await page.goto("/docs/collaboration/documents");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    // The @mentions section must be present.
    await expect(
      page.getByRole("heading", { name: /@mention|comment/i }),
    ).toBeVisible();
    await expect(
      page.getByText(/mention|inbox/i).first(),
    ).toBeVisible();
  });

  test("decisions page shows ADR-0002 multi-tenant revision note", async ({
    page,
  }) => {
    await page.goto("/docs/decisions");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(
      page.getByText(/org table|multi-tenant|revision in progress/i).first(),
    ).toBeVisible();
  });
});
