import { expect, test } from "@playwright/test";
import { TEST_USERS } from "../constants/test-users";

// Mobile responsiveness sweep at 375px: the document must not overflow the
// viewport horizontally (the canonical "it fits on a phone" assertion), and the
// page's primary content must render. Individual scroll containers (tables,
// toolbars) may scroll internally — we assert the PAGE itself doesn't.
const PHONE = { width: 375, height: 812 };

async function expectNoHorizontalOverflow(page: import("@playwright/test").Page) {
  const overflow = await page.evaluate(() => {
    const el = document.documentElement;
    return el.scrollWidth - el.clientWidth;
  });
  // Allow 1px for sub-pixel rounding.
  expect(overflow, "page overflows the viewport horizontally").toBeLessThanOrEqual(1);
}

test.describe("Mobile (375px) — no horizontal overflow", () => {
  test.use({ viewport: PHONE });

  test("sign-in fits the phone", async ({ page }) => {
    await page.goto("/sign-in");
    await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test.describe("authenticated", () => {
    test.use({ storageState: TEST_USERS.admin.authFile });

    for (const route of ["/", "/inbox", "/documents", "/admin"]) {
      test(`${route} fits the phone`, async ({ page }) => {
        await page.goto(route);
        await page.waitForTimeout(800); // let client islands settle
        await expectNoHorizontalOverflow(page);
      });
    }

    test("the redesigned inbox is single-pane on mobile (list, then detail)", async ({
      page,
    }) => {
      await page.goto("/inbox");
      // The two-pane resizable group is desktop-only.
      await expect(page.getByTestId("inbox-list")).toBeVisible();
      const item = page.getByTestId("inbox-item").first();
      if ((await item.count()) === 0) test.skip(true, "empty inbox");
      await item.click();
      // Detail replaces the list on mobile; a back affordance returns to it.
      await expect(page.getByTestId("inbox-back")).toBeVisible();
      await expectNoHorizontalOverflow(page);
      await page.getByTestId("inbox-back").click();
      await expect(page.getByTestId("inbox-list")).toBeVisible();
    });

    test("a run-detail page fits the phone", async ({ page }) => {
      await page.goto("/inbox");
      await page.getByRole("tab").nth(1).click();
      const item = page.getByTestId("inbox-item").first();
      if ((await item.count()) === 0) test.skip(true, "no runs");
      await item.click();
      await page.getByTestId("inbox-open-run").click();
      await expect(page).toHaveURL(/\/runs\//);
      await expectNoHorizontalOverflow(page);
    });
  });
});
