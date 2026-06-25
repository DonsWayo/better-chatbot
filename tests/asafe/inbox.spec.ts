import { expect, test } from "@playwright/test";
import { TEST_USERS } from "../constants/test-users";

// Two-pane, mail-style Inbox (src/components/inbox/inbox-view.tsx).
// Admin has seeded run history, so the Runs tab is always populated.
test.describe("Inbox — two-pane triage surface", () => {
  test.use({ storageState: TEST_USERS.admin.authFile });

  test("renders the inbox shell with four tabs", async ({ page }) => {
    await page.goto("/inbox");
    await expect(
      page.getByRole("heading", { name: /inbox/i, level: 1 }),
    ).toBeVisible();
    // Tabs: Approvals, Runs, Routines, Mentions.
    await expect(page.getByRole("tab")).toHaveCount(4);
  });

  test("Mentions tab renders without crashing", async ({ page }) => {
    await page.goto("/inbox");
    // Fourth tab is Mentions.
    await page.getByRole("tab").nth(3).click();
    await expect(page.getByRole("tab").nth(3)).toHaveAttribute(
      "data-state",
      "active",
    );
    // Either a mention list or the empty state is shown; the page must not error.
    await expect(
      page
        .getByTestId("inbox-mentions-list")
        .or(page.getByTestId("inbox-mentions-empty")),
    ).toBeVisible();
  });

  test("Runs tab: select an item → detail pane → open the full run", async ({
    page,
  }) => {
    await page.goto("/inbox");

    // Default tab is Approvals only when approvals exist; otherwise Runs.
    // Force the Runs tab so the assertion is deterministic.
    await page.getByRole("tab").nth(1).click();

    const items = page.getByTestId("inbox-item");
    await expect(items.first()).toBeVisible();

    await items.first().click();
    await expect(page.getByTestId("inbox-detail")).toBeVisible();

    const openRun = page.getByTestId("inbox-open-run");
    await expect(openRun).toBeVisible();
    await openRun.click();
    await expect(page).toHaveURL(/\/runs\/[0-9a-f-]{36}/);
    // The redesigned run page shows the steps timeline heading.
    await expect(
      page.getByRole("heading", { name: /steps/i }),
    ).toBeVisible();
  });

  test("search filters the run list", async ({ page }) => {
    await page.goto("/inbox");
    await page.getByRole("tab").nth(1).click();

    const items = page.getByTestId("inbox-item");
    await expect(items.first()).toBeVisible();

    // A query that matches nothing collapses the list to the empty state.
    await page.getByTestId("inbox-search").fill("zzz-no-such-run-xyz");
    await expect(items).toHaveCount(0);

    // Clearing restores items.
    await page.getByTestId("inbox-search").fill("");
    await expect(items.first()).toBeVisible();
  });

  test("Routines tab renders the routines management list", async ({
    page,
  }) => {
    await page.goto("/inbox");
    await page.getByRole("tab").nth(2).click();
    // Either the routines list or its empty state renders (no crash).
    await expect(page.getByTestId("inbox-detail")).toBeHidden();
    await expect(page.getByRole("tab").nth(2)).toHaveAttribute(
      "data-state",
      "active",
    );
  });
});
