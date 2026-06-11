import { type Page, expect, test } from "@playwright/test";
import { ensureSidebarOpen } from "../helpers/sidebar-helper";

// The editable profile moved out of a popup/drawer into the /settings/account
// page (data-testid="user-detail-content"). These tests verify the name change
// there propagates to the sidebar user dropdown (which exposes sidebar-user-name
// inside DropdownMenuContent — you must open the dropdown to read it).

async function readSidebarName(page: Page): Promise<string> {
  await ensureSidebarOpen(page);
  await page.getByTestId("sidebar-user-button").click();
  await page.getByTestId("sidebar-user-name").waitFor({
    state: "visible",
    timeout: 5000,
  });
  const name =
    (await page.getByTestId("sidebar-user-name").textContent()) ?? "";
  // Close the dropdown again.
  await page.keyboard.press("Escape");
  return name.trim();
}

async function setNameOnAccountPage(page: Page, name: string): Promise<void> {
  await page.goto("/settings/account", { waitUntil: "networkidle" });
  const nameInput = page.getByTestId("user-name-input");
  await expect(nameInput).toBeVisible();
  await nameInput.fill(name);
  const saveButton = page.getByTestId("save-changes-button");
  await expect(saveButton).toBeEnabled();
  await saveButton.click();
  // Allow the SWR mutation / session to round-trip.
  await page.waitForTimeout(1500);
}

test.describe("User Name Synchronization", () => {
  test("regular user: name change on /settings/account syncs to the sidebar", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      storageState: "tests/.auth/regular-user.json",
    });
    const page = await context.newPage();
    try {
      await page.goto("/");
      await page.waitForLoadState("networkidle");
      const originalName = await readSidebarName(page);
      expect(originalName.length).toBeGreaterThan(0);

      const newName = `Updated User ${Date.now()}`;
      try {
        await setNameOnAccountPage(page, newName);

        await page.goto("/");
        await page.waitForLoadState("networkidle");
        const updatedName = await readSidebarName(page);
        expect(updatedName).toBe(newName);
      } finally {
        await setNameOnAccountPage(page, originalName || "Test Regular User");
      }
    } finally {
      await context.close();
    }
  });

  test("admin: name change on /settings/account syncs to the sidebar", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      storageState: "tests/.auth/admin.json",
    });
    const page = await context.newPage();
    try {
      await page.goto("/");
      await page.waitForLoadState("networkidle");
      const originalName = await readSidebarName(page);
      expect(originalName.length).toBeGreaterThan(0);

      const newName = `Updated Admin ${Date.now()}`;
      try {
        await setNameOnAccountPage(page, newName);

        await page.goto("/");
        await page.waitForLoadState("networkidle");
        const updatedName = await readSidebarName(page);
        expect(updatedName).toBe(newName);
      } finally {
        await setNameOnAccountPage(page, originalName || "Test Admin User");
      }
    } finally {
      await context.close();
    }
  });
});
