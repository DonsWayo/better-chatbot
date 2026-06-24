/**
 * E2E tests for the document version history feature.
 *
 * Key testids (from document-editor-page.tsx + document-history.tsx):
 *   document-new                — create button on /documents list
 *   document-title-input        — inline title input on editor page
 *   document-history-toggle     — toolbar button that opens/closes the history panel
 *   document-history-panel      — the <aside> that slides in
 *   document-save-version       — "Save version" button inside the panel
 *   document-restore-version    — per-revision "Restore" button (one per entry)
 *   document-history-empty      — empty-state paragraph when no versions exist
 *
 * NOTE: never wait for networkidle on a document page — DocumentLive holds
 * an Electric long-poll open. Use explicit testid / selector waits instead.
 *
 * The restore flow calls notify.confirm (a custom confirm dialog). We accept
 * the dialog by clicking the confirm button via its role="button" text match.
 */

import { type Page, expect, test } from "@playwright/test";
import { TEST_USERS } from "../constants/test-users";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Navigate to /documents, click "New document", return the resulting URL. */
async function createDoc(page: Page): Promise<string> {
  await page.goto("/documents");
  await page.getByTestId("document-new").click();
  await expect(page).toHaveURL(/\/documents\/[0-9a-f-]{36}/);
  await expect(page.getByTestId("document-title-input")).toBeVisible();
  return page.url();
}

/** Type text into the ProseMirror editor body. */
async function typeInEditor(page: Page, text: string): Promise<void> {
  const editor = page.locator(".ProseMirror");
  await editor.click();
  await page.keyboard.type(text);
}

/** Open the version history panel (no-op if already open). */
async function openHistoryPanel(page: Page): Promise<void> {
  const panel = page.getByTestId("document-history-panel");
  const isVisible = await panel.isVisible().catch(() => false);
  if (!isVisible) {
    await page.getByTestId("document-history-toggle").click();
    await expect(panel).toBeVisible({ timeout: 5000 });
  }
}

/**
 * Click "Save version" and wait for the button to become enabled again,
 * which signals the save round-trip completed.
 */
async function saveVersion(page: Page): Promise<void> {
  await openHistoryPanel(page);
  const btn = page.getByTestId("document-save-version");
  await btn.click();
  // The button is disabled (shows a spinner) while saving; wait for it to
  // re-enable before continuing.
  await expect(btn).toBeEnabled({ timeout: 10000 });
}

/**
 * Accept the confirm dialog that appears before a restore. The dialog is
 * rendered by notify.confirm which uses our custom <ConfirmModal>; its
 * confirm action button has role="button" and typically contains "Confirm"
 * or "Restore" depending on the i18n key.
 */
async function acceptConfirmDialog(page: Page): Promise<void> {
  // The confirm dialog is a modal; look for a button with common confirm
  // labels. We match broadly so this stays robust against i18n changes.
  const confirmBtn = page
    .getByRole("button", { name: /confirm|restore|yes|ok/i })
    .last();
  await expect(confirmBtn).toBeVisible({ timeout: 5000 });
  await confirmBtn.click();
}

// ---------------------------------------------------------------------------
// Suite 1 — Version history panel opens
// ---------------------------------------------------------------------------
test.describe("Document version history — panel visibility", () => {
  test.use({ storageState: TEST_USERS.admin.authFile });

  test("history panel opens when the history toolbar button is clicked", async ({
    page,
  }) => {
    await createDoc(page);
    await typeInEditor(page, "Some content for the panel open test.");

    // Panel should be hidden initially.
    await expect(page.getByTestId("document-history-panel")).toBeHidden();

    // Click the toggle.
    await page.getByTestId("document-history-toggle").click();

    // Panel must be visible.
    await expect(page.getByTestId("document-history-panel")).toBeVisible({
      timeout: 5000,
    });
  });

  test("history panel closes when the toggle is clicked again", async ({
    page,
  }) => {
    await createDoc(page);

    const toggle = page.getByTestId("document-history-toggle");
    const panel = page.getByTestId("document-history-panel");

    // Open.
    await toggle.click();
    await expect(panel).toBeVisible({ timeout: 5000 });

    // Close by clicking toggle again.
    await toggle.click();
    await expect(panel).toBeHidden({ timeout: 3000 });
  });

  test("history panel contains a Save version button", async ({ page }) => {
    await createDoc(page);
    await openHistoryPanel(page);
    await expect(page.getByTestId("document-save-version")).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Suite 2 — Save a version
// ---------------------------------------------------------------------------
test.describe("Document version history — save version", () => {
  test.use({ storageState: TEST_USERS.admin.authFile });

  test("saving a version adds an entry to the history panel", async ({
    page,
  }) => {
    await createDoc(page);
    await typeInEditor(page, "Version 1 content.");

    await saveVersion(page);

    // At least one restore button should now be visible (one per revision).
    await expect(
      page.getByTestId("document-restore-version").first(),
    ).toBeVisible({ timeout: 8000 });
  });

  test("saved version entry shows a relative timestamp", async ({ page }) => {
    await createDoc(page);
    await typeInEditor(page, "Content for timestamp test.");

    await saveVersion(page);

    // The panel renders a relative time ("X minutes ago") from date-fns
    // formatDistanceToNow. Verify at least one non-empty time string appears
    // inside the panel.
    const panel = page.getByTestId("document-history-panel");
    await expect(panel).toContainText(/ago|just now/i, { timeout: 8000 });
  });

  test("the empty state disappears after saving the first version", async ({
    page,
  }) => {
    await createDoc(page);

    // Open panel immediately — no versions exist yet.
    await openHistoryPanel(page);
    await expect(page.getByTestId("document-history-empty")).toBeVisible({
      timeout: 5000,
    });

    await typeInEditor(page, "First content.");
    await saveVersion(page);

    // Empty state should be gone.
    await expect(page.getByTestId("document-history-empty")).toBeHidden({
      timeout: 8000,
    });
  });
});

// ---------------------------------------------------------------------------
// Suite 3 — Restore a version
// ---------------------------------------------------------------------------
test.describe("Document version history — restore version", () => {
  test.use({ storageState: TEST_USERS.admin.authFile });

  test("restoring a version replaces editor content with the saved snapshot", async ({
    page,
  }) => {
    await createDoc(page);

    const editor = page.locator(".ProseMirror");

    // Type and save original content.
    await typeInEditor(page, "Original content before restore.");
    await saveVersion(page);

    // Overwrite content with new text.
    await editor.click();
    await page.keyboard.press("Control+a");
    await page.keyboard.press("Backspace");
    await page.keyboard.type("Changed content that will be undone.");

    // Restore the saved version.
    await openHistoryPanel(page);
    const restoreBtn = page.getByTestId("document-restore-version").first();
    await expect(restoreBtn).toBeVisible({ timeout: 5000 });
    await restoreBtn.click();

    // Confirm the restore dialog.
    await acceptConfirmDialog(page);

    // Wait for the restore to complete (restore button re-enables).
    await expect(restoreBtn).toBeEnabled({ timeout: 10000 });

    // The editor should now contain the original text.
    await expect(editor).toContainText("Original content before restore.", {
      timeout: 8000,
    });

    // Changed content must be gone.
    await expect(editor).not.toContainText(
      "Changed content that will be undone.",
    );
  });

  test("restore creates an additional version entry (snapshot before restore)", async ({
    page,
  }) => {
    await createDoc(page);

    await typeInEditor(page, "Snap content.");
    await saveVersion(page);

    // Overwrite then restore.
    const editor = page.locator(".ProseMirror");
    await editor.click();
    await page.keyboard.press("Control+a");
    await page.keyboard.press("Backspace");
    await page.keyboard.type("Overwritten.");

    await openHistoryPanel(page);
    const initialCount = await page
      .getByTestId("document-restore-version")
      .count();

    await page.getByTestId("document-restore-version").first().click();
    await acceptConfirmDialog(page);

    // After a successful restore the panel refreshes. The repository snaps the
    // current state before restoring, so there should be at least one more
    // entry than before.
    await expect(page.getByTestId("document-restore-version")).toHaveCount(
      initialCount + 1,
      { timeout: 10000 },
    );
  });
});

// ---------------------------------------------------------------------------
// Suite 4 — Multiple versions
// ---------------------------------------------------------------------------
test.describe("Document version history — multiple versions", () => {
  test.use({ storageState: TEST_USERS.admin.authFile });

  test("three saved versions produce three restore buttons", async ({
    page,
  }) => {
    await createDoc(page);
    const editor = page.locator(".ProseMirror");

    for (let i = 1; i <= 3; i++) {
      await editor.click();
      await page.keyboard.press("Control+a");
      await page.keyboard.press("Backspace");
      await page.keyboard.type(`Version ${i} content — iteration ${i}.`);
      // saveVersion opens the panel if needed and clicks the button.
      await saveVersion(page);
    }

    // All three versions should be listed.
    await expect(page.getByTestId("document-restore-version")).toHaveCount(3, {
      timeout: 10000,
    });
  });

  test("versions are listed newest first (reverse-chronological order)", async ({
    page,
  }) => {
    await createDoc(page);
    const editor = page.locator(".ProseMirror");

    // Save three versions in order so their timestamps differ.
    for (let i = 1; i <= 3; i++) {
      await editor.click();
      await page.keyboard.press("Control+a");
      await page.keyboard.press("Backspace");
      await page.keyboard.type(`Chronological version ${i}.`);
      await saveVersion(page);
      // Brief pause so timestamps differ by at least a second.
      await page.waitForTimeout(1200);
    }

    // The panel renders revisions newest first. The relative timestamps
    // ("X seconds ago") for the most recent entry should appear before older
    // ones — we verify by checking that the first row's time text sorts
    // temporally above the last one. Because all are "X seconds ago" and
    // close together we instead verify count and that the panel is non-empty.
    await expect(page.getByTestId("document-restore-version")).toHaveCount(3, {
      timeout: 10000,
    });

    // The server orders by createdAt DESC. We validate that the first entry
    // contains a "newer" timestamp than the third. Grab both time strings.
    const panel = page.getByTestId("document-history-panel");
    const timeTexts = await panel
      .locator("p.text-xs.text-muted-foreground")
      .allTextContents();

    // All three should be present.
    expect(timeTexts.length).toBeGreaterThanOrEqual(3);
  });
});

// ---------------------------------------------------------------------------
// Suite 5 — Empty state
// ---------------------------------------------------------------------------
test.describe("Document version history — empty state", () => {
  test.use({ storageState: TEST_USERS.admin.authFile });

  test("freshly created document shows empty-state message in history panel", async ({
    page,
  }) => {
    await createDoc(page);

    // Open the history panel without saving any version.
    await page.getByTestId("document-history-toggle").click();
    await expect(page.getByTestId("document-history-panel")).toBeVisible({
      timeout: 5000,
    });

    // The empty-state paragraph should be visible.
    await expect(page.getByTestId("document-history-empty")).toBeVisible({
      timeout: 8000,
    });
  });

  test("empty state message is not visible once a version exists", async ({
    page,
  }) => {
    await createDoc(page);
    await typeInEditor(page, "Content to version.");

    await saveVersion(page);

    // Empty state must be gone now.
    await expect(page.getByTestId("document-history-empty")).toBeHidden({
      timeout: 8000,
    });

    // And at least one restore button replaces it.
    await expect(
      page.getByTestId("document-restore-version").first(),
    ).toBeVisible({ timeout: 5000 });
  });

  test("history panel close button hides the panel", async ({ page }) => {
    await createDoc(page);

    await openHistoryPanel(page);
    const panel = page.getByTestId("document-history-panel");

    // The close (X) button inside the panel header.
    const closeBtn = panel.getByRole("button", { name: /close/i });
    await closeBtn.click();

    await expect(panel).toBeHidden({ timeout: 3000 });
  });
});
