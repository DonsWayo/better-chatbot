import { test, expect } from "@playwright/test";
import { TEST_USERS } from "../constants/test-users";
import { ensureSidebarOpen } from "../helpers/sidebar-helper";

// No REST API exists for /api/admin/teams — teams are managed via server actions.
// These tests focus on page-level access control and sidebar visibility.

test.describe("Admin Teams Page - Access Control", () => {
  test("admin can visit /admin/teams and page loads without redirect", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      storageState: TEST_USERS.admin.authFile,
    });
    const page = await context.newPage();

    await page.goto("/admin/teams", { waitUntil: "networkidle" });

    // Should stay on the teams page (no redirect to / or /sign-in)
    expect(page.url()).toContain("/admin/teams");

    // Should NOT see an unauthorized error
    await expect(page.getByText("401")).not.toBeVisible();
    await expect(page.getByText("403")).not.toBeVisible();

    await context.close();
  });

  test("regular user visiting /admin/teams is denied (401 page)", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      storageState: TEST_USERS.regular.authFile,
    });
    const page = await context.newPage();

    await page.goto("/admin/teams", { waitUntil: "networkidle" });
    await page.waitForLoadState("networkidle");

    // Next.js unauthorized() renders a 401 page; the URL may stay or redirect
    // Accept either a 401 text on the page or a redirect away from /admin/teams
    const url = page.url();
    const has401 = await page.getByText("401").isVisible().catch(() => false);
    const redirectedAway = !url.includes("/admin/teams");

    expect(has401 || redirectedAway).toBeTruthy();

    await context.close();
  });

  test("editor visiting /admin/teams is denied (401 page)", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      storageState: TEST_USERS.editor.authFile,
    });
    const page = await context.newPage();

    await page.goto("/admin/teams", { waitUntil: "networkidle" });
    await page.waitForLoadState("networkidle");

    const url = page.url();
    const has401 = await page.getByText("401").isVisible().catch(() => false);
    const redirectedAway = !url.includes("/admin/teams");

    expect(has401 || redirectedAway).toBeTruthy();

    await context.close();
  });
});

test.describe("Admin Sidebar - Teams link visibility", () => {
  test("admin can see the Teams link in the admin sidebar", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      storageState: TEST_USERS.admin.authFile,
    });
    const page = await context.newPage();

    // Navigate to an admin page so the sidebar sub-items expand
    await page.goto("/admin/teams", { waitUntil: "networkidle" });
    await ensureSidebarOpen(page);

    // The sub-item link has data-testid="admin-sidebar-link-teams"
    await expect(page.getByTestId("admin-sidebar-link-teams")).toBeVisible();

    await context.close();
  });

  test("admin sidebar Teams link navigates to /admin/teams", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      storageState: TEST_USERS.admin.authFile,
    });
    const page = await context.newPage();

    // Start at the admin root so the sub-items render
    await page.goto("/admin", { waitUntil: "networkidle" });
    await ensureSidebarOpen(page);

    // Click the Teams sub-item
    await page.getByTestId("admin-sidebar-link-teams").click();
    await page.waitForLoadState("networkidle");

    expect(page.url()).toContain("/admin/teams");

    await context.close();
  });

  test("regular user does NOT see the admin sidebar section at all", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      storageState: TEST_USERS.regular.authFile,
    });
    const page = await context.newPage();

    await page.goto("/", { waitUntil: "networkidle" });
    await ensureSidebarOpen(page);

    // The top-level admin link and all sub-items should be absent
    await expect(page.getByTestId("admin-sidebar-link")).not.toBeVisible();
    await expect(
      page.getByTestId("admin-sidebar-link-teams"),
    ).not.toBeVisible();

    await context.close();
  });

  test("editor does NOT see the admin sidebar section at all", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      storageState: TEST_USERS.editor.authFile,
    });
    const page = await context.newPage();

    await page.goto("/", { waitUntil: "networkidle" });
    await ensureSidebarOpen(page);

    await expect(page.getByTestId("admin-sidebar-link")).not.toBeVisible();
    await expect(
      page.getByTestId("admin-sidebar-link-teams"),
    ).not.toBeVisible();

    await context.close();
  });
});
