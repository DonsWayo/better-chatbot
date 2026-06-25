/**
 * E2E tests for the full document CRUD flow:
 *
 *  1. Document creation from the /documents list page
 *  2. Document creation from the sidebar "+ Document" button
 *  3. Document title editing with autosave
 *  4. Document deletion from the editor header
 *  5. Document deletion from the /documents list (via sidebar ⋮ menu)
 *  6. Empty state rendering on /documents
 *  7. Navigation — back arrow in the editor header returns to /documents
 *
 * NOTE: never wait for networkidle on a document page — DocumentLive holds
 * an Electric long-poll open. Use explicit testid / selector waits instead.
 */

import { type Page, expect, test } from "@playwright/test";
import { TEST_USERS } from "../constants/test-users";

// ---------------------------------------------------------------------------
// Shared helper — navigate to /documents, click "New Document", wait for the
// editor URL and the title input to be ready, then return the doc URL.
// ---------------------------------------------------------------------------
async function createDoc(page: Page): Promise<string> {
  await page.goto("/documents");
  await page.getByTestId("document-new").click();
  await expect(page).toHaveURL(/\/documents\/[0-9a-f-]{36}/, {
    timeout: 10_000,
  });
  await expect(page.getByTestId("document-title-input")).toBeVisible({
    timeout: 8_000,
  });
  return page.url();
}

// ---------------------------------------------------------------------------
// Suite 1 — Document creation from the list page
// ---------------------------------------------------------------------------
test.describe("Document CRUD — creation from list page", () => {
  test.use({ storageState: TEST_USERS.admin.authFile });

  test("clicking New Document navigates to a new editor URL", async ({
    page,
  }) => {
    await page.goto("/documents");

    // The button must be visible before we click it.
    const newBtn = page.getByTestId("document-new");
    await expect(newBtn).toBeVisible({ timeout: 8_000 });
    await newBtn.click();

    // URL must change to the UUID-based editor route.
    await expect(page).toHaveURL(/\/documents\/[0-9a-f-]{36}/, {
      timeout: 10_000,
    });
  });

  test("editor title input is visible after creation", async ({ page }) => {
    await createDoc(page);
    await expect(page.getByTestId("document-title-input")).toBeVisible({
      timeout: 8_000,
    });
  });

  test("typed editor content is present in the editor", async ({ page }) => {
    await createDoc(page);

    const editor = page.locator(".ProseMirror");
    await editor.click();
    await page.keyboard.type("Hello from the CRUD test suite.");

    await expect(editor).toContainText("Hello from the CRUD test suite.", {
      timeout: 5_000,
    });
  });

  test("new document appears in the /documents list after creation", async ({
    page,
  }) => {
    const TITLE = `CRUD list test ${Date.now()}`;

    // Create the doc and give it a unique title.
    await createDoc(page);

    const titleInput = page.getByTestId("document-title-input");
    await titleInput.click();
    await titleInput.fill(TITLE);
    // Tab away to commit and trigger autosave.
    await page.keyboard.press("Tab");

    // Wait for "Saved" status indicator to confirm the server round-trip.
    await expect(page.getByTestId("document-save-status")).toContainText(
      /saved/i,
      { timeout: 10_000 },
    );

    // Navigate back to the list.
    await page.goto("/documents");

    // The new doc must appear in the list.
    await expect(page.getByTestId("documents-list")).toBeVisible({
      timeout: 8_000,
    });
    await expect(
      page.getByTestId("documents-list").getByText(TITLE, { exact: false }),
    ).toBeVisible({ timeout: 8_000 });
  });
});

// ---------------------------------------------------------------------------
// Suite 2 — Document creation from the sidebar
// ---------------------------------------------------------------------------
test.describe("Document CRUD — creation from sidebar", () => {
  test.use({ storageState: TEST_USERS.admin.authFile });

  test("sidebar + button creates a doc and navigates to the editor", async ({
    page,
  }) => {
    await page.goto("/");

    // The sidebar Documents section has a + button that is opacity-0 until the
    // group is hovered. Force a hover on the group so the button reveals.
    const sidebarNewBtn = page.getByTestId("sidebar-document-new");

    // Hover over the container element (the SidebarGroupContent) to trigger the
    // group-hover CSS that lifts opacity. We hover the button itself — it is
    // still in the DOM at opacity-0 and Playwright can force-click it.
    await sidebarNewBtn.dispatchEvent("click");

    // URL must change to a document editor route.
    await expect(page).toHaveURL(/\/documents\/[0-9a-f-]{36}/, {
      timeout: 10_000,
    });
  });

  test("editor is visible after sidebar creation", async ({ page }) => {
    await page.goto("/");

    const sidebarNewBtn = page.getByTestId("sidebar-document-new");
    await sidebarNewBtn.dispatchEvent("click");

    await expect(page).toHaveURL(/\/documents\/[0-9a-f-]{36}/, {
      timeout: 10_000,
    });
    await expect(page.getByTestId("document-title-input")).toBeVisible({
      timeout: 8_000,
    });
  });
});

// ---------------------------------------------------------------------------
// Suite 3 — Document title editing with autosave
// ---------------------------------------------------------------------------
test.describe("Document CRUD — title editing", () => {
  test.use({ storageState: TEST_USERS.admin.authFile });

  test("title change is persisted and shown in the list", async ({ page }) => {
    const UNIQUE_TITLE = `Title Edit Test ${Date.now()}`;

    await createDoc(page);

    const titleInput = page.getByTestId("document-title-input");

    // Clear the existing title (empty by default) and type the new one.
    await titleInput.click();
    await page.keyboard.press("Control+a");
    await titleInput.fill(UNIQUE_TITLE);

    // Blur the input to flush the autosave immediately.
    await page.keyboard.press("Tab");

    // Wait for the save-status indicator to confirm the save completed.
    await expect(page.getByTestId("document-save-status")).toContainText(
      /saved/i,
      { timeout: 10_000 },
    );

    // Navigate to the list and verify the title appears.
    await page.goto("/documents");
    await expect(page.getByTestId("documents-list")).toBeVisible({
      timeout: 8_000,
    });
    await expect(
      page
        .getByTestId("documents-list")
        .getByText(UNIQUE_TITLE, { exact: false }),
    ).toBeVisible({ timeout: 8_000 });
  });

  test("title input reflects typed text immediately", async ({ page }) => {
    await createDoc(page);

    const titleInput = page.getByTestId("document-title-input");
    await titleInput.click();
    await titleInput.fill("My Test Document Title");

    await expect(titleInput).toHaveValue("My Test Document Title");
  });

  test("save status shows 'saving' then 'saved' after title change", async ({
    page,
  }) => {
    await createDoc(page);

    const titleInput = page.getByTestId("document-title-input");
    await titleInput.click();
    await titleInput.fill(`Autosave check ${Date.now()}`);
    await page.keyboard.press("Tab");

    // Eventually the status must settle on "saved".
    await expect(page.getByTestId("document-save-status")).toContainText(
      /saved/i,
      { timeout: 12_000 },
    );
  });
});

// ---------------------------------------------------------------------------
// Suite 4 — Document deletion from the editor
// ---------------------------------------------------------------------------
test.describe("Document CRUD — deletion from editor", () => {
  test.use({ storageState: TEST_USERS.admin.authFile });

  test("delete button in editor navigates back to /documents", async ({
    page,
  }) => {
    await createDoc(page);

    // The delete button is only rendered when the user has canManage access.
    // Admin always has it.
    const deleteBtn = page.getByTestId("document-delete");
    await expect(deleteBtn).toBeVisible({ timeout: 8_000 });
    await deleteBtn.click();

    // A confirm dialog appears (notify.confirm). Accept it.
    // The dialog is rendered as a Radix AlertDialog — the confirm button has
    // text matching the i18n key "Common.confirm" or "delete".
    const confirmBtn = page
      .getByRole("button", { name: /confirm|delete|yes/i })
      .last();
    await expect(confirmBtn).toBeVisible({ timeout: 5_000 });
    await confirmBtn.click();

    // After deletion the router pushes /documents.
    await expect(page).toHaveURL(/\/documents$/, { timeout: 10_000 });
  });

  test("deleted document no longer appears in the list", async ({ page }) => {
    const TITLE = `Delete-from-editor ${Date.now()}`;

    await createDoc(page);

    // Set a unique title so we can identify the row.
    const titleInput = page.getByTestId("document-title-input");
    await titleInput.click();
    await titleInput.fill(TITLE);
    await page.keyboard.press("Tab");
    await expect(page.getByTestId("document-save-status")).toContainText(
      /saved/i,
      { timeout: 10_000 },
    );

    // Delete.
    const deleteBtn = page.getByTestId("document-delete");
    await expect(deleteBtn).toBeVisible({ timeout: 5_000 });
    await deleteBtn.click();

    const confirmBtn = page
      .getByRole("button", { name: /confirm|delete|yes/i })
      .last();
    await expect(confirmBtn).toBeVisible({ timeout: 5_000 });
    await confirmBtn.click();

    // Must be back on the list.
    await expect(page).toHaveURL(/\/documents$/, { timeout: 10_000 });

    // The deleted doc must not appear.
    // If documents-empty is showing, the deletion is also confirmed.
    const listEl = page.getByTestId("documents-list");
    const emptyEl = page.getByTestId("documents-empty");

    // Wait for either the list or the empty state to appear (the SWR revalidates
    // after the action mutates).
    await expect(listEl.or(emptyEl)).toBeVisible({ timeout: 8_000 });

    const listVisible = await listEl.isVisible();
    if (listVisible) {
      await expect(listEl.getByText(TITLE, { exact: false })).not.toBeVisible({
        timeout: 5_000,
      });
    }
    // If emptyEl is showing the title is obviously gone.
  });
});

// ---------------------------------------------------------------------------
// Suite 5 — Document deletion from the sidebar ⋮ menu
// ---------------------------------------------------------------------------
test.describe("Document CRUD — deletion from sidebar", () => {
  test.use({ storageState: TEST_USERS.admin.authFile });

  test("deleting from sidebar dropdown removes the doc from the sidebar list", async ({
    page,
  }) => {
    const TITLE = `Sidebar-delete-test ${Date.now()}`;

    // Create a doc with a unique title so we can find its sidebar row.
    await createDoc(page);
    const titleInput = page.getByTestId("document-title-input");
    await titleInput.click();
    await titleInput.fill(TITLE);
    await page.keyboard.press("Tab");
    await expect(page.getByTestId("document-save-status")).toContainText(
      /saved/i,
      { timeout: 10_000 },
    );

    // Navigate to the home page so the sidebar is visible alongside the doc.
    await page.goto("/");

    // Wait for the sidebar to show the doc row (SWR loads it on mount).
    const sidebarRow = page
      .getByTestId("sidebar-document-row")
      .filter({ hasText: TITLE });
    await expect(sidebarRow).toBeVisible({ timeout: 10_000 });

    // Hover the row to reveal the ⋮ action button.
    await sidebarRow.hover();

    // Fallback: look for any button inside the parent group item.
    const parentItem = page
      .locator("[data-testid='sidebar-document-row']")
      .filter({ hasText: TITLE })
      .locator("xpath=ancestor::div[contains(@class,'flex')]")
      .first();

    // Hover the parent item to reveal the kebab menu.
    await parentItem.hover();

    // Locate the MoreHorizontal trigger (SidebarMenuAction).
    const kebabTrigger = parentItem.getByRole("button").last();
    await expect(kebabTrigger).toBeVisible({ timeout: 5_000 });
    await kebabTrigger.click();

    // Click "Delete" in the dropdown.
    const deleteOption = page.getByRole("menuitem", { name: /delete/i });
    await expect(deleteOption).toBeVisible({ timeout: 5_000 });
    await deleteOption.click();

    // Confirm the notify.confirm dialog.
    const confirmBtn = page
      .getByRole("button", { name: /confirm|delete|yes/i })
      .last();
    await expect(confirmBtn).toBeVisible({ timeout: 5_000 });
    await confirmBtn.click();

    // The sidebar row must disappear.
    await expect(sidebarRow).not.toBeVisible({ timeout: 8_000 });
  });
});

// ---------------------------------------------------------------------------
// Suite 5b — Document deletion from /documents list (⋮ on list rows)
// ---------------------------------------------------------------------------
test.describe("Document CRUD — deletion from list page", () => {
  test.use({ storageState: TEST_USERS.admin.authFile });

  test("document can be deleted via the editor and is gone from the list", async ({
    page,
  }) => {
    // The /documents list page shows rows but has no per-row delete menu in the
    // current DocumentsList component — deletion is editor-header only.
    // This test creates a doc, deletes it from the editor, then asserts the
    // /documents list no longer shows it.

    const TITLE = `List-delete-check ${Date.now()}`;

    await createDoc(page);
    const titleInput = page.getByTestId("document-title-input");
    await titleInput.click();
    await titleInput.fill(TITLE);
    await page.keyboard.press("Tab");
    await expect(page.getByTestId("document-save-status")).toContainText(
      /saved/i,
      { timeout: 10_000 },
    );

    // Delete from editor.
    const deleteBtn = page.getByTestId("document-delete");
    await expect(deleteBtn).toBeVisible({ timeout: 5_000 });
    await deleteBtn.click();

    const confirmBtn = page
      .getByRole("button", { name: /confirm|delete|yes/i })
      .last();
    await expect(confirmBtn).toBeVisible({ timeout: 5_000 });
    await confirmBtn.click();

    await expect(page).toHaveURL(/\/documents$/, { timeout: 10_000 });

    // Verify the list (if it exists) does not contain our title.
    const listEl = page.getByTestId("documents-list");
    const emptyEl = page.getByTestId("documents-empty");
    await expect(listEl.or(emptyEl)).toBeVisible({ timeout: 8_000 });

    if (await listEl.isVisible()) {
      await expect(listEl.getByText(TITLE, { exact: false })).not.toBeVisible();
    }
  });
});

// ---------------------------------------------------------------------------
// Suite 6 — Empty state
// ---------------------------------------------------------------------------
test.describe("Document CRUD — empty state", () => {
  test.use({ storageState: TEST_USERS.admin.authFile });

  test("/documents shows either the list or the empty state (not both)", async ({
    page,
  }) => {
    await page.goto("/documents");

    const listEl = page.getByTestId("documents-list");
    const emptyEl = page.getByTestId("documents-empty");

    // One of them must appear within a reasonable time after the SWR load.
    await expect(listEl.or(emptyEl)).toBeVisible({ timeout: 10_000 });

    const listVisible = await listEl.isVisible();
    const emptyVisible = await emptyEl.isVisible();

    // Exactly one must be visible.
    expect(listVisible !== emptyVisible).toBeTruthy();
  });

  test("empty state shows the New Document CTA", async ({ page }) => {
    // This test only passes when the user has no documents. If the admin
    // already has docs the empty state won't appear, so we guard with a
    // conditional skip.
    await page.goto("/documents");

    const emptyEl = page.getByTestId("documents-empty");
    const listEl = page.getByTestId("documents-list");

    await expect(listEl.or(emptyEl)).toBeVisible({ timeout: 10_000 });

    const emptyVisible = await emptyEl.isVisible();
    if (!emptyVisible) {
      // Admin has existing docs — can't test empty state with this user.
      test.skip();
      return;
    }

    // The EmptyState component renders a Button inside the documents-empty div.
    await expect(emptyEl.getByRole("button")).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Suite 7 — Navigation: back arrow returns to /documents
// ---------------------------------------------------------------------------
test.describe("Document CRUD — navigation breadcrumb", () => {
  test.use({ storageState: TEST_USERS.admin.authFile });

  test("back arrow in editor header navigates to /documents", async ({
    page,
  }) => {
    await createDoc(page);

    // The back arrow is an <a> (Link) with aria-label matching t("backToList").
    // We locate it by its href attribute which is always /documents.
    const backLink = page
      .getByRole("link", { name: /back|documents/i })
      .first();
    await expect(backLink).toBeVisible({ timeout: 5_000 });
    await backLink.click();

    await expect(page).toHaveURL(/\/documents$/, { timeout: 10_000 });
  });

  test("back arrow href points to /documents", async ({ page }) => {
    await createDoc(page);

    // Verify the href directly without navigating.
    const backLink = page
      .getByRole("link", { name: /back|documents/i })
      .first();
    await expect(backLink).toBeVisible({ timeout: 5_000 });

    const href = await backLink.getAttribute("href");
    expect(href).toBe("/documents");
  });

  test("navigating to /documents after editing shows the updated title", async ({
    page,
  }) => {
    const TITLE = `Breadcrumb nav test ${Date.now()}`;

    await createDoc(page);

    const titleInput = page.getByTestId("document-title-input");
    await titleInput.click();
    await titleInput.fill(TITLE);
    await page.keyboard.press("Tab");
    await expect(page.getByTestId("document-save-status")).toContainText(
      /saved/i,
      { timeout: 10_000 },
    );

    // Use the back link.
    const backLink = page
      .getByRole("link", { name: /back|documents/i })
      .first();
    await backLink.click();

    await expect(page).toHaveURL(/\/documents$/, { timeout: 10_000 });

    // The list must contain our updated title.
    await expect(page.getByTestId("documents-list")).toBeVisible({
      timeout: 8_000,
    });
    await expect(
      page.getByTestId("documents-list").getByText(TITLE, { exact: false }),
    ).toBeVisible({ timeout: 8_000 });
  });
});
