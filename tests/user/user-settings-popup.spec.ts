import { expect, test } from "@playwright/test";
import { ensureSidebarOpen } from "../helpers/sidebar-helper";

// Use regular user auth state for user settings tests
test.use({ storageState: "tests/.auth/regular-user.json" });

// The user "settings" surface is no longer a popup/drawer. The sidebar user
// menu now links to /settings, which redirects to the tabbed settings hub; the
// editable profile (formerly the drawer) lives at /settings/account and renders
// data-testid="user-detail-content". These tests exercise that page-based flow.
test.describe("User Settings (account page)", () => {
  test("sidebar user menu links into the settings hub", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await ensureSidebarOpen(page);

    // Open the slim footer user dropdown
    await page.getByTestId("sidebar-user-button").click();

    const settingsItem = page.getByTestId("user-settings-menu-item");
    await expect(settingsItem).toBeVisible();
    await settingsItem.click();

    // Navigates into /settings/* (the bare /settings redirects to a tab).
    await expect(page).toHaveURL(/\/settings(\/|$)/);
  });

  test("account page shows the editable profile for the current user", async ({
    page,
  }) => {
    await page.goto("/settings/account", { waitUntil: "networkidle" });

    await expect(page.getByTestId("user-detail-content")).toBeVisible();

    // The name field is pre-populated with the signed-in user's name.
    const nameInput = page.getByTestId("user-name-input");
    await expect(nameInput).toBeVisible();
    expect((await nameInput.inputValue()).length).toBeGreaterThan(0);

    // "your" self-service context (not the admin "user ..." copy).
    const content =
      (await page.getByTestId("user-detail-content").textContent()) ?? "";
    expect(content).not.toMatch(/user account status/i);
  });

  test("user can update their own name and save", async ({ page }) => {
    await page.goto("/settings/account", { waitUntil: "networkidle" });
    await expect(page.getByTestId("user-detail-content")).toBeVisible();

    const nameInput = page.getByTestId("user-name-input");
    const saveButton = page.getByTestId("save-changes-button");
    const originalName = await nameInput.inputValue();

    try {
      await nameInput.fill("Updated User Name");
      await expect(saveButton).toBeEnabled();
      await saveButton.click();
      // Give the mutation time to round-trip.
      await page.waitForTimeout(1500);
      // The field keeps the new value after save.
      await expect(nameInput).toHaveValue("Updated User Name");
    } finally {
      // Restore so the test is idempotent.
      await nameInput.fill(originalName);
      if (await saveButton.isEnabled().catch(() => false)) {
        await saveButton.click();
        await page.waitForTimeout(1000);
      }
    }
  });
});
