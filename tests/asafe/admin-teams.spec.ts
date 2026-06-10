import { test, expect } from "@playwright/test";
import { TEST_USERS } from "../constants/test-users";
import {
  ensureSidebarOpen,
  ensureAdminSidebarReady,
} from "../helpers/sidebar-helper";

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

    // The teams list rendered its admin-only "New Team" control, which proves
    // the page loaded for an admin and was not replaced by the unauthorized
    // boundary. (A substring match on "401"/"403" is unsafe — team names contain
    // timestamps that can include those digits.)
    await expect(
      page.getByRole("button", { name: /new team/i }),
    ).toBeVisible();

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

    // Non-admins hit requireAdminPermission() → unauthorized(): the admin-only
    // "New Team" control must NOT render (whether the boundary keeps the URL or
    // redirects away).
    await expect(
      page.getByRole("button", { name: /new team/i }),
    ).not.toBeVisible();

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

    await expect(
      page.getByRole("button", { name: /new team/i }),
    ).not.toBeVisible();

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
    await ensureAdminSidebarReady(page);

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
    await ensureAdminSidebarReady(page);

    // Click the Teams sub-item
    const teamsLink = page.getByTestId("admin-sidebar-link-teams");
    await expect(teamsLink).toBeVisible();
    await teamsLink.click();

    await expect(page).toHaveURL(/\/admin\/teams/);

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
