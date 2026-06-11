import { expect, test } from "@playwright/test";
import { TEST_USERS } from "../constants/test-users";
import { ensureSidebarOpen } from "../helpers/sidebar-helper";

test.describe("Permissions", () => {
  test("regular user can access basic functionality", async ({ browser }) => {
    // Create context with regular user auth
    const context = await browser.newContext({
      storageState: TEST_USERS.regular.authFile,
    });
    const page = await context.newPage();

    // Regular users might access through profile/settings
    // Test basic navigation works
    await page.goto("/");

    // Check if user has access to basic functionality
    await page.waitForLoadState("networkidle");
    const url = page.url();
    expect(url).not.toContain("/sign-in");

    await context.close();
  });

  test("editor user can access application but not admin panel", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      storageState: TEST_USERS.editor.authFile,
    });
    const page = await context.newPage();

    // Editor should have access to main app
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    const homeUrl = page.url();
    expect(homeUrl).not.toContain("/sign-in");

    // But should not have access to admin panel
    await page.goto("/admin/users");
    await page.waitForLoadState("networkidle");
    await expect(page.getByText("401")).toBeVisible();
  });

  test("regular user cannot access admin panel", async ({ browser }) => {
    const context = await browser.newContext({
      storageState: TEST_USERS.regular.authFile,
    });
    const page = await context.newPage();

    // But should not have access to admin panel
    await page.goto("/admin/users");
    await page.waitForLoadState("networkidle");
    await expect(page.getByText("401")).toBeVisible();

    await context.close();
  });
  // The entry into the admin console moved from a dedicated sidebar link into
  // the slim sidebar user dropdown (admin-only, data-testid
  // "admin-console-menu-item", linking to /admin which redirects to
  // /admin/users). Open the dropdown via the user button to inspect it.
  test("admin sees the Admin console item in the user menu", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      storageState: TEST_USERS.admin.authFile,
    });
    const page = await context.newPage();
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await ensureSidebarOpen(page);
    await page.getByTestId("sidebar-user-button").click();
    await expect(page.getByTestId("admin-console-menu-item")).toBeVisible();
    await context.close();
  });
  test("editor does NOT see the Admin console item in the user menu", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      storageState: TEST_USERS.editor.authFile,
    });
    const page = await context.newPage();
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await ensureSidebarOpen(page);
    await page.getByTestId("sidebar-user-button").click();
    await expect(page.getByTestId("admin-console-menu-item")).not.toBeVisible();
    await context.close();
  });
  test("regular user does NOT see the Admin console item in the user menu", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      storageState: TEST_USERS.regular.authFile,
    });
    const page = await context.newPage();
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await ensureSidebarOpen(page);
    await page.getByTestId("sidebar-user-button").click();
    await expect(page.getByTestId("admin-console-menu-item")).not.toBeVisible();
    await context.close();
  });
  test("Admin console item navigates into the admin users page", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      storageState: TEST_USERS.admin.authFile,
    });
    const page = await context.newPage();
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await ensureSidebarOpen(page);
    await page.getByTestId("sidebar-user-button").click();
    const adminItem = page.getByTestId("admin-console-menu-item");
    await expect(adminItem).toBeVisible();
    await adminItem.click();
    // The menu item links to /admin (the admin console Dashboard home). The
    // admin sidebar — including its Users sub-link — renders there.
    await expect(page).toHaveURL(/\/admin(\/|$)/);
    await expect(page.getByTestId("admin-sidebar-link-users")).toBeVisible();
    await context.close();
  });
});
