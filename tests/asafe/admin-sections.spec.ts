import { expect, test } from "@playwright/test";
import { TEST_USERS } from "../constants/test-users";

// Every admin section renders for an admin without crashing (no error boundary,
// no 401) and is gated from non-admins. Complements the deeper per-feature
// admin specs by guaranteeing the whole console stays navigable.
const ADMIN_ROUTES = [
  "/admin",
  "/admin/users",
  "/admin/teams",
  "/admin/usage",
  "/admin/mcp",
  "/admin/knowledge",
  "/admin/role-packs",
  "/admin/quality",
  "/admin/guardrails",
  "/admin/feature-flags",
  "/admin/api-keys",
  "/admin/audit",
];

test.describe("Admin console — every section renders", () => {
  test.describe("as admin", () => {
    test.use({ storageState: TEST_USERS.admin.authFile });

    for (const route of ADMIN_ROUTES) {
      test(`${route} renders without error`, async ({ page }) => {
        await page.goto(route);
        const body = await page.locator("body").innerText();
        expect(body).not.toMatch(/not authorized|something went wrong/i);
        // A heading anchors the page (sidebar + a content title both render).
        await expect(page.getByRole("heading").first()).toBeVisible();
      });
    }
  });

  test.describe("as a regular user", () => {
    test.use({ storageState: TEST_USERS.regular.authFile });

    test("is blocked from the admin console with a 401 page", async ({
      page,
    }) => {
      await page.goto("/admin/users");
      await expect(page.locator("body")).toContainText(/not authorized/i);
      await expect(page.locator('a[href="/admin/users"]')).toHaveCount(0);
    });
  });
});
