/**
 * E2E tests for document visibility and sharing.
 *
 * The visibility model has four levels, controlled by the
 * `[data-testid="document-visibility-trigger"]` button in the editor header.
 * Clicking it opens a popover with four radio-like buttons:
 *   [data-testid="visibility-level-private"]
 *   [data-testid="visibility-level-shared"]
 *   [data-testid="visibility-level-team"]
 *   [data-testid="visibility-level-company"]
 *
 * The trigger button text always reflects the current visibility label
 * ("Private", "Shared", "Team", "Company") so assertions can be done on its
 * text content — no brittle icon class checks needed.
 *
 * NOTE: never wait for networkidle on a document page — DocumentLive holds
 * an Electric long-poll open. Use explicit testid / selector waits instead.
 */

import { type Page, expect, test } from "@playwright/test";
import { TEST_USERS } from "../constants/test-users";

// ---------------------------------------------------------------------------
// Helper: navigate to /documents, click "New", wait for the editor URL.
// Returns the full URL of the newly created document.
// ---------------------------------------------------------------------------
async function createDoc(page: Page): Promise<string> {
  await page.goto("/documents");
  await page.getByTestId("document-new").click();
  await expect(page).toHaveURL(/\/documents\/[0-9a-f-]{36}/);
  await expect(page.getByTestId("document-title-input")).toBeVisible();
  return page.url();
}

/**
 * Open the visibility popover and click the desired level button.
 * Waits for the popover to appear, clicks the level, then waits for the
 * popover to close (indicating the server action completed and the trigger
 * label updated).
 */
async function setVisibility(
  page: Page,
  level: "private" | "shared" | "team" | "company",
): Promise<void> {
  const trigger = page.getByTestId("document-visibility-trigger");
  await trigger.click();

  const levelBtn = page.getByTestId(`visibility-level-${level}`);
  await expect(levelBtn).toBeVisible({ timeout: 5000 });
  await levelBtn.click();

  // For "team" the picker shows a team selection sub-panel; close the popover
  // by pressing Escape so the trigger label can be read.
  if (level === "team") {
    // If no teams are available the panel shows a "no membership" note.
    // Either way we just close the popover so the trigger label updates.
    await page.keyboard.press("Escape");
  } else {
    // The popover closes automatically once the server action resolves.
    // Wait for it to become hidden.
    await expect(levelBtn).toBeHidden({ timeout: 8000 });
  }
}

// ---------------------------------------------------------------------------
// Suite 1 — Default visibility is private
// ---------------------------------------------------------------------------
test.describe("Document visibility — default private", () => {
  test.use({ storageState: TEST_USERS.admin.authFile });

  test("new document shows Private visibility by default", async ({ page }) => {
    await createDoc(page);

    const trigger = page.getByTestId("document-visibility-trigger");
    await expect(trigger).toBeVisible();

    // The trigger button text reflects the current visibility label.
    await expect(trigger).toContainText(/private/i);
  });
});

// ---------------------------------------------------------------------------
// Suite 2 — Change visibility to "shared"
// ---------------------------------------------------------------------------
test.describe("Document visibility — change to shared", () => {
  test.use({ storageState: TEST_USERS.admin.authFile });

  test("can change visibility to Shared and trigger label updates", async ({
    page,
  }) => {
    await createDoc(page);

    // Confirm initial state is Private.
    const trigger = page.getByTestId("document-visibility-trigger");
    await expect(trigger).toContainText(/private/i);

    // Open picker and select Shared.
    await setVisibility(page, "shared");

    // The trigger should now read "Shared".
    await expect(trigger).toContainText(/shared/i, { timeout: 8000 });
  });

  test("Shared level shows the grant-manager panel inside the popover", async ({
    page,
  }) => {
    await createDoc(page);

    const trigger = page.getByTestId("document-visibility-trigger");
    await trigger.click();

    const sharedBtn = page.getByTestId("visibility-level-shared");
    await expect(sharedBtn).toBeVisible({ timeout: 5000 });
    await sharedBtn.click();

    // After selecting "shared" the GrantManager (or save-first note) renders.
    // Either [data-testid="visibility-shared-panel"] or
    // [data-testid="visibility-shared-unsaved"] should appear.
    const sharedPanel = page
      .getByTestId("visibility-shared-panel")
      .or(page.getByTestId("visibility-shared-unsaved"));
    await expect(sharedPanel).toBeVisible({ timeout: 5000 });

    await page.keyboard.press("Escape");
  });
});

// ---------------------------------------------------------------------------
// Suite 3 — Change visibility to "team"
// ---------------------------------------------------------------------------
test.describe("Document visibility — change to team", () => {
  test.use({ storageState: TEST_USERS.admin.authFile });

  test("can change visibility to Team and trigger label updates", async ({
    page,
  }) => {
    await createDoc(page);

    const trigger = page.getByTestId("document-visibility-trigger");
    await expect(trigger).toContainText(/private/i);

    // Open picker and select Team.
    await trigger.click();
    const teamBtn = page.getByTestId("visibility-level-team");
    await expect(teamBtn).toBeVisible({ timeout: 5000 });
    await teamBtn.click();

    // The team sub-panel or no-membership note should appear.
    const teamPanel = page
      .getByTestId("visibility-team-panel")
      .or(page.getByText(/not a member of any team/i));
    await expect(teamPanel).toBeVisible({ timeout: 5000 });

    // Close the popover.
    await page.keyboard.press("Escape");

    // The trigger should now read "Team".
    await expect(trigger).toContainText(/team/i, { timeout: 8000 });
  });
});

// ---------------------------------------------------------------------------
// Suite 4 — Change visibility to "company" (admin only)
// ---------------------------------------------------------------------------
test.describe("Document visibility — change to company", () => {
  test.use({ storageState: TEST_USERS.admin.authFile });

  test("admin can change visibility to Company and trigger label updates", async ({
    page,
  }) => {
    await createDoc(page);

    const trigger = page.getByTestId("document-visibility-trigger");
    await expect(trigger).toContainText(/private/i);

    await setVisibility(page, "company");

    // The trigger should now read "Company".
    await expect(trigger).toContainText(/company/i, { timeout: 8000 });
  });
});

// ---------------------------------------------------------------------------
// Suite 5 — Visibility persists after page reload
// ---------------------------------------------------------------------------
test.describe("Document visibility — persistence after reload", () => {
  test.use({ storageState: TEST_USERS.admin.authFile });

  test("Shared visibility survives a full page reload", async ({ page }) => {
    const docUrl = await createDoc(page);

    // Change to Shared.
    await setVisibility(page, "shared");

    const trigger = page.getByTestId("document-visibility-trigger");
    await expect(trigger).toContainText(/shared/i, { timeout: 8000 });

    // Hard reload.
    await page.goto(docUrl);
    await expect(page.getByTestId("document-title-input")).toBeVisible();

    // The trigger must still read "Shared" after reload.
    await expect(trigger).toContainText(/shared/i);
  });

  test("Company visibility survives a full page reload", async ({ page }) => {
    const docUrl = await createDoc(page);

    await setVisibility(page, "company");

    const trigger = page.getByTestId("document-visibility-trigger");
    await expect(trigger).toContainText(/company/i, { timeout: 8000 });

    await page.goto(docUrl);
    await expect(page.getByTestId("document-title-input")).toBeVisible();

    await expect(trigger).toContainText(/company/i);
  });
});

// ---------------------------------------------------------------------------
// Suite 6 — Private doc not accessible by another user
// ---------------------------------------------------------------------------
test.describe("Document visibility — access control", () => {
  test("private doc is not accessible by a regular user", async ({
    browser,
  }) => {
    // ── Step 1: admin creates a private document ─────────────────────────
    const adminCtx = await browser.newContext({
      storageState: TEST_USERS.admin.authFile,
    });
    const adminPage = await adminCtx.newPage();

    await adminPage.goto("/documents");
    await adminPage.getByTestId("document-new").click();
    await expect(adminPage).toHaveURL(/\/documents\/[0-9a-f-]{36}/);
    await expect(adminPage.getByTestId("document-title-input")).toBeVisible();

    // Confirm the doc is private (the default).
    const adminTrigger = adminPage.getByTestId("document-visibility-trigger");
    await expect(adminTrigger).toContainText(/private/i);

    const privateDocUrl = adminPage.url();

    await adminCtx.close();

    // ── Step 2: regular user tries to open the private doc URL ────────────
    const userCtx = await browser.newContext({
      storageState: TEST_USERS.regular.authFile,
    });
    const userPage = await userCtx.newPage();

    const response = await userPage.goto(privateDocUrl, {
      waitUntil: "domcontentloaded",
    });

    // The app must either:
    //   (a) return a non-200 HTTP status (404 from the page handler), OR
    //   (b) redirect to /sign-in (302/200 on the sign-in page), OR
    //   (c) render a "not found" / access-denied message in the DOM.
    const finalUrl = userPage.url();
    const httpStatus = response?.status() ?? 0;

    const redirectedToSignIn = finalUrl.includes("/sign-in");
    const notFoundStatus = httpStatus === 404 || httpStatus === 403;
    const notFoundInDom =
      (await userPage.getByText(/not found|forbidden|access denied/i).count()) >
      0;

    // At least one of these must be true.
    expect(
      redirectedToSignIn || notFoundStatus || notFoundInDom,
      `Expected 403/404 or sign-in redirect when regular user accesses a private doc.
       URL: ${finalUrl}, HTTP status: ${httpStatus}`,
    ).toBe(true);

    await userCtx.close();
  });

  test("editor user cannot change visibility on another user's private doc", async ({
    browser,
  }) => {
    // Admin creates a doc (private by default).
    const adminCtx = await browser.newContext({
      storageState: TEST_USERS.admin.authFile,
    });
    const adminPage = await adminCtx.newPage();

    await adminPage.goto("/documents");
    await adminPage.getByTestId("document-new").click();
    await expect(adminPage).toHaveURL(/\/documents\/[0-9a-f-]{36}/);
    await expect(adminPage.getByTestId("document-title-input")).toBeVisible();

    const privateDocUrl = adminPage.url();
    await adminCtx.close();

    // Editor user tries to navigate to the same doc.
    const editorCtx = await browser.newContext({
      storageState: TEST_USERS.editor.authFile,
    });
    const editorPage = await editorCtx.newPage();

    const response = await editorPage.goto(privateDocUrl, {
      waitUntil: "domcontentloaded",
    });

    const finalUrl = editorPage.url();
    const httpStatus = response?.status() ?? 0;

    const redirectedToSignIn = finalUrl.includes("/sign-in");
    const notFoundStatus = httpStatus === 404 || httpStatus === 403;
    const notFoundInDom =
      (await editorPage
        .getByText(/not found|forbidden|access denied/i)
        .count()) > 0;

    expect(
      redirectedToSignIn || notFoundStatus || notFoundInDom,
      `Editor user should not see a private doc owned by admin.
       URL: ${finalUrl}, HTTP status: ${httpStatus}`,
    ).toBe(true);

    await editorCtx.close();
  });
});
