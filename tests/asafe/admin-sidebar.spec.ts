import { expect, test } from "@playwright/test";
import { TEST_USERS } from "../constants/test-users";
import {
  ensureAdminSidebarReady,
  ensureSidebarOpen,
} from "../helpers/sidebar-helper";

let _c = 0;
function uid(): string {
  _c++;
  return `${_c}-${process.pid}`;
}

// uid is available for future use; suppress unused warning
void uid;

test.describe("Admin sidebar link visibility", () => {
  test("admin at /admin: admin-sidebar-link-teams is present", async ({
    browser,
  }) => {
    const ctx = await browser.newContext({
      storageState: TEST_USERS.admin.authFile,
    });
    const page = await ctx.newPage();

    await page.goto("/admin", { waitUntil: "networkidle" });
    await ensureAdminSidebarReady(page);

    const count = await page.getByTestId("admin-sidebar-link-teams").count();
    expect(count).toBeGreaterThan(0);

    await ctx.close();
  });

  test("admin at /admin: admin-sidebar-link-usage is present", async ({
    browser,
  }) => {
    const ctx = await browser.newContext({
      storageState: TEST_USERS.admin.authFile,
    });
    const page = await ctx.newPage();

    await page.goto("/admin", { waitUntil: "networkidle" });
    await ensureAdminSidebarReady(page);

    const count = await page.getByTestId("admin-sidebar-link-usage").count();
    expect(count).toBeGreaterThan(0);

    await ctx.close();
  });

  test("admin at /admin: admin-sidebar-link-knowledge is present", async ({
    browser,
  }) => {
    const ctx = await browser.newContext({
      storageState: TEST_USERS.admin.authFile,
    });
    const page = await ctx.newPage();

    await page.goto("/admin", { waitUntil: "networkidle" });
    await ensureAdminSidebarReady(page);

    const count = await page
      .getByTestId("admin-sidebar-link-knowledge")
      .count();
    expect(count).toBeGreaterThan(0);

    await ctx.close();
  });

  test("admin clicks admin-sidebar-link-teams and navigates to /admin/teams", async ({
    browser,
  }) => {
    const ctx = await browser.newContext({
      storageState: TEST_USERS.admin.authFile,
    });
    const page = await ctx.newPage();

    await page.goto("/admin", { waitUntil: "networkidle" });
    await ensureAdminSidebarReady(page);

    const teamsLink = page.getByTestId("admin-sidebar-link-teams");
    await expect(teamsLink).toBeVisible();
    await teamsLink.click();

    // Use a polling URL assertion so client-side navigation is awaited reliably
    // (a one-shot url() check races link hydration).
    await expect(page).toHaveURL(/\/admin\/teams/);

    await ctx.close();
  });

  test("admin at /admin: admin-sidebar-link-feature-flags is present", async ({
    browser,
  }) => {
    const ctx = await browser.newContext({
      storageState: TEST_USERS.admin.authFile,
    });
    const page = await ctx.newPage();

    await page.goto("/admin", { waitUntil: "networkidle" });
    await ensureAdminSidebarReady(page);

    const count = await page
      .getByTestId("admin-sidebar-link-feature-flags")
      .count();
    expect(count).toBeGreaterThan(0);

    await ctx.close();
  });

  test("admin clicks feature-flags nav and navigates to /admin/feature-flags", async ({
    browser,
  }) => {
    const ctx = await browser.newContext({
      storageState: TEST_USERS.admin.authFile,
    });
    const page = await ctx.newPage();

    await page.goto("/admin", { waitUntil: "networkidle" });
    await ensureAdminSidebarReady(page);

    const ffLink = page.getByTestId("admin-sidebar-link-feature-flags");
    await expect(ffLink).toBeVisible();
    await ffLink.click();

    await expect(page).toHaveURL(/\/admin\/feature-flags/);
    // Kill switch card should be visible
    await expect(page.getByTestId("kill-switch-card")).toBeVisible();

    await ctx.close();
  });

  test("regular user at /: admin-sidebar-link-teams count is 0", async ({
    browser,
  }) => {
    const ctx = await browser.newContext({
      storageState: TEST_USERS.regular.authFile,
    });
    const page = await ctx.newPage();

    await page.goto("/", { waitUntil: "networkidle" });
    await ensureSidebarOpen(page);

    const count = await page.getByTestId("admin-sidebar-link-teams").count();
    expect(count).toBe(0);

    await ctx.close();
  });

  test("editor at /: admin-sidebar-link-teams count is 0", async ({
    browser,
  }) => {
    const ctx = await browser.newContext({
      storageState: TEST_USERS.editor.authFile,
    });
    const page = await ctx.newPage();

    await page.goto("/", { waitUntil: "networkidle" });
    await ensureSidebarOpen(page);

    const count = await page.getByTestId("admin-sidebar-link-teams").count();
    expect(count).toBe(0);

    await ctx.close();
  });
});
