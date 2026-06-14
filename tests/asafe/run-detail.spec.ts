import { expect, test } from "@playwright/test";
import { TEST_USERS } from "../constants/test-users";

// Redesigned run transcript page (src/app/(chat)/runs/[id]/page.tsx): header
// card + a vertical step timeline. Reach a real run via the Inbox → Runs tab.
test.describe("Run detail — trace timeline", () => {
  test.use({ storageState: TEST_USERS.admin.authFile });

  test("opens a run from the inbox and shows the header + step timeline", async ({
    page,
  }) => {
    await page.goto("/inbox");
    await page.getByRole("tab").nth(1).click(); // Runs tab

    const items = page.getByTestId("inbox-item");
    await expect(items.first()).toBeVisible();
    await items.first().click();
    await page.getByTestId("inbox-open-run").click();

    await expect(page).toHaveURL(/\/runs\/[0-9a-f-]{36}/);

    // Header: the run kind is the H1, plus a Steps section heading.
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /steps/i }),
    ).toBeVisible();

    // A completed run has at least one timeline step (#index marker present).
    await expect(page.getByText(/^#\d+$/).first()).toBeVisible();

    // The back link (top of the run content, href="/") returns home. Scope to
    // <main> so the loose /back/i name can't match a sidebar thread link.
    await page.locator('main a[href="/"]').first().click();
    await expect(page).toHaveURL(/\/(?:$|\?)/);
  });

  test("a non-existent run id redirects/404s without crashing", async ({
    page,
  }) => {
    const res = await page.goto(
      "/runs/00000000-0000-0000-0000-000000000000",
    );
    // notFound() → 404 status, but the route renders the styled not-found UI
    // (no white screen / unhandled error boundary).
    expect([404, 200]).toContain(res?.status() ?? 200);
    await expect(page.locator("body")).not.toBeEmpty();
  });
});
