/**
 * E2E tests for the document comments feature.
 *
 *  1. Comments panel opens and closes via the toggle button
 *  2. Adding a comment persists it in the panel and clears the form
 *  3. Multiple comments appear in chronological order
 *  4. Deleting a comment removes it from the panel
 *  5. Submitting an empty/uninitialized form shows a toast or rejects the submit
 *  6. AI reply button is visible after a comment exists (full AI flow covered
 *     in document-ai.spec.ts — see Suite 6 note below)
 *  7. Comments survive navigation away and back (DB persistence)
 *
 * NOTE: never wait for networkidle on a document page — DocumentLive holds
 * an Electric long-poll open. Use explicit testid / selector waits instead.
 *
 * NOTE: the comments panel uses SWR polling (4 s interval) while open. Tests
 * that need to observe a server-confirmed state await the poll by waiting for
 * the comment text to appear rather than asserting immediately after submit.
 */

import { type Page, expect, test } from "@playwright/test";
import { TEST_USERS } from "../constants/test-users";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Navigate to /documents, create a new doc, and return the URL. */
async function createDoc(page: Page): Promise<string> {
  await page.goto("/documents");
  await page.getByTestId("document-new").click();
  await expect(page).toHaveURL(/\/documents\/[0-9a-f-]{36}/);
  await expect(page.getByTestId("document-title-input")).toBeVisible();
  return page.url();
}

/**
 * Open the comments panel via the toggle button and wait until the panel is
 * fully visible. Waits for either the empty-state message or the comments
 * list — whichever appears first signals that the SWR fetch has completed.
 */
async function openCommentsPanel(page: Page): Promise<void> {
  await page.getByTestId("document-comments-toggle").click();
  await expect(page.getByTestId("document-comments-panel")).toBeVisible({
    timeout: 5000,
  });
  // Wait for the loading skeletons to resolve before interacting with the panel.
  // Either "empty" state or the form becomes visible once loading is done.
  await expect(
    page
      .getByTestId("document-comments-empty")
      .or(page.getByTestId("document-comment-form")),
  ).toBeVisible({ timeout: 8000 });
}

/**
 * Type a plain-text comment into the MentionInput contenteditable and submit
 * it. Waits for the comment text to appear in the panel before returning.
 */
async function addComment(page: Page, text: string): Promise<void> {
  const form = page.getByTestId("document-comment-form");
  const composer = form.locator('[contenteditable="true"]').first();
  await composer.click();
  await page.keyboard.type(text);

  // Wait for the submit button to be enabled (content is non-empty).
  const submitBtn = page.getByTestId("document-comment-submit");
  await expect(submitBtn).toBeEnabled({ timeout: 3000 });
  await submitBtn.click();

  // Wait for the optimistic / server-confirmed comment to appear.
  await expect(page.getByText(text, { exact: false })).toBeVisible({
    timeout: 10000,
  });
}

// ---------------------------------------------------------------------------
// Suite 1 — Comments panel opens / closes
// ---------------------------------------------------------------------------
test.describe("Document comments — panel toggle", () => {
  test.use({ storageState: TEST_USERS.admin.authFile });

  test("toggle button opens the comments panel", async ({ page }) => {
    await createDoc(page);

    const toggle = page.getByTestId("document-comments-toggle");
    await expect(toggle).toBeVisible();

    // Panel should not be present before first click.
    await expect(page.getByTestId("document-comments-panel")).not.toBeVisible();

    await toggle.click();
    await expect(page.getByTestId("document-comments-panel")).toBeVisible({
      timeout: 5000,
    });
  });

  test("toggle button closes an open comments panel", async ({ page }) => {
    await createDoc(page);

    const toggle = page.getByTestId("document-comments-toggle");

    // Open the panel.
    await toggle.click();
    await expect(page.getByTestId("document-comments-panel")).toBeVisible({
      timeout: 5000,
    });

    // Click again — panel should close.
    await toggle.click();
    await expect(page.getByTestId("document-comments-panel")).not.toBeVisible();
  });

  test("close button inside the panel hides the panel", async ({ page }) => {
    await createDoc(page);

    await page.getByTestId("document-comments-toggle").click();
    const panel = page.getByTestId("document-comments-panel");
    await expect(panel).toBeVisible({ timeout: 5000 });

    // The panel has an X close button (aria-label from i18n "comments.close").
    const closeBtn = panel.getByRole("button", { name: /close/i }).first();
    await closeBtn.click();

    await expect(panel).not.toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Suite 2 — Add a comment
// ---------------------------------------------------------------------------
test.describe("Document comments — add comment", () => {
  test.use({ storageState: TEST_USERS.admin.authFile });

  test("submitted comment appears in the panel", async ({ page }) => {
    await createDoc(page);
    await openCommentsPanel(page);

    const commentText = "Test comment for e2e";
    await addComment(page, commentText);

    // Comment must be visible inside the panel.
    const panel = page.getByTestId("document-comments-panel");
    await expect(panel.getByText(commentText, { exact: false })).toBeVisible();
  });

  test("form contenteditable is cleared after submit", async ({ page }) => {
    await createDoc(page);
    await openCommentsPanel(page);

    const form = page.getByTestId("document-comment-form");
    const composer = form.locator('[contenteditable="true"]').first();
    await composer.click();
    await page.keyboard.type("Clearing test comment");

    const submitBtn = page.getByTestId("document-comment-submit");
    await expect(submitBtn).toBeEnabled({ timeout: 3000 });
    await submitBtn.click();

    // Wait for the comment to appear (confirms submit completed).
    await expect(
      page.getByText("Clearing test comment", { exact: false }),
    ).toBeVisible({ timeout: 10000 });

    // The contenteditable should now be empty (cleared on submit).
    // textContent of a blank ProseMirror node is empty or contains only "\n".
    const composerText = await composer.textContent();
    expect((composerText ?? "").trim()).toBe("");
  });

  test("submit button is disabled when form is empty", async ({ page }) => {
    await createDoc(page);
    await openCommentsPanel(page);

    // Without typing anything, the submit button must be disabled.
    const submitBtn = page.getByTestId("document-comment-submit");
    await expect(submitBtn).toBeDisabled();
  });

  test("author name appears next to new comment", async ({ page }) => {
    await createDoc(page);
    await openCommentsPanel(page);

    await addComment(page, "Author name verification comment");

    const panel = page.getByTestId("document-comments-panel");
    // The admin user's name should appear as the author of the comment.
    await expect(
      panel.getByText(TEST_USERS.admin.name, { exact: false }),
    ).toBeVisible({ timeout: 5000 });
  });
});

// ---------------------------------------------------------------------------
// Suite 3 — Chronological order
// ---------------------------------------------------------------------------
test.describe("Document comments — chronological order", () => {
  test.use({ storageState: TEST_USERS.admin.authFile });

  test("two comments appear in the order they were submitted", async ({
    page,
  }) => {
    await createDoc(page);
    await openCommentsPanel(page);

    await addComment(page, "First comment");
    await addComment(page, "Second comment");

    const panel = page.getByTestId("document-comments-panel");
    const firstEl = panel.getByText("First comment", { exact: false });
    const secondEl = panel.getByText("Second comment", { exact: false });

    await expect(firstEl).toBeVisible();
    await expect(secondEl).toBeVisible();

    // "First comment" should appear before "Second comment" in the DOM.
    const firstBox = await firstEl.first().boundingBox();
    const secondBox = await secondEl.first().boundingBox();

    // Both boxes must be resolvable (elements are in the viewport).
    expect(firstBox).not.toBeNull();
    expect(secondBox).not.toBeNull();

    // Older comment rendered above the newer one (smaller Y coordinate).
    expect(firstBox!.y).toBeLessThan(secondBox!.y);
  });

  test("three comments preserve insertion order", async ({ page }) => {
    await createDoc(page);
    await openCommentsPanel(page);

    const comments = ["Alpha comment", "Beta comment", "Gamma comment"];
    for (const text of comments) {
      await addComment(page, text);
    }

    const panel = page.getByTestId("document-comments-panel");
    const boxes: Array<{ y: number }> = [];
    for (const text of comments) {
      const el = panel.getByText(text, { exact: false }).first();
      await expect(el).toBeVisible();
      const box = await el.boundingBox();
      expect(box).not.toBeNull();
      boxes.push({ y: box!.y });
    }

    // Y coordinates must be strictly increasing (top to bottom = oldest to newest).
    expect(boxes[0].y).toBeLessThan(boxes[1].y);
    expect(boxes[1].y).toBeLessThan(boxes[2].y);
  });
});

// ---------------------------------------------------------------------------
// Suite 4 — Delete a comment
// ---------------------------------------------------------------------------
test.describe("Document comments — delete comment", () => {
  test.use({ storageState: TEST_USERS.admin.authFile });

  test("delete button removes the comment from the panel", async ({ page }) => {
    await createDoc(page);
    await openCommentsPanel(page);

    const commentText = "Comment to be deleted";
    await addComment(page, commentText);

    const panel = page.getByTestId("document-comments-panel");
    await expect(panel.getByText(commentText, { exact: false })).toBeVisible();

    // The delete control is rendered as a ghost button whose text matches the
    // i18n key "comments.delete" (typically the word "Delete").
    const deleteBtn = panel.getByRole("button", { name: /delete/i }).first();
    await expect(deleteBtn).toBeVisible({ timeout: 5000 });
    await deleteBtn.click();

    // A confirmation dialog appears (notify.confirm). Confirm the deletion.
    // The dialog may be a native browser dialog or a custom modal; handle both.
    page.once("dialog", async (dialog) => {
      await dialog.accept();
    });

    // If it is a custom confirm dialog (not a native browser alert), look for a
    // confirm/yes/ok button and click it.
    const confirmBtn = page
      .getByRole("button", { name: /confirm|yes|ok|delete/i })
      .filter({ hasNot: page.getByRole("button", { name: /cancel/i }) })
      .last();

    // Wait briefly for the modal to appear; if it does, click confirm.
    const confirmVisible = await confirmBtn
      .isVisible({ timeout: 2000 })
      .catch(() => false);
    if (confirmVisible) {
      await confirmBtn.click();
    }

    // The comment should no longer appear in the panel.
    await expect(
      panel.getByText(commentText, { exact: false }),
    ).not.toBeVisible({ timeout: 8000 });
  });

  test("non-author does not see the delete button", async ({ browser }) => {
    // Admin creates the document and adds a comment.
    const adminContext = await browser.newContext({
      storageState: TEST_USERS.admin.authFile,
    });
    const adminPage = await adminContext.newPage();
    await createDoc(adminPage);
    const docUrl = adminPage.url();

    await adminPage.getByTestId("document-comments-toggle").click();
    await expect(adminPage.getByTestId("document-comments-panel")).toBeVisible({
      timeout: 5000,
    });
    await addComment(adminPage, "Admin-owned comment");
    await adminContext.close();

    // Editor user visits the same document.
    const editorContext = await browser.newContext({
      storageState: TEST_USERS.editor.authFile,
    });
    const editorPage = await editorContext.newPage();
    await editorPage.goto(docUrl);
    await expect(editorPage.getByTestId("document-title-input")).toBeVisible();

    await editorPage.getByTestId("document-comments-toggle").click();
    const panel = editorPage.getByTestId("document-comments-panel");
    await expect(panel).toBeVisible({ timeout: 5000 });

    // Wait for the comment from admin to load.
    await expect(
      panel.getByText("Admin-owned comment", { exact: false }),
    ).toBeVisible({ timeout: 10000 });

    // The editor user is not the comment owner, so the delete button should be
    // absent (comment.isOwner is false for them).
    await expect(
      panel.getByRole("button", { name: /delete/i }),
    ).not.toBeVisible();

    await editorContext.close();
  });
});

// ---------------------------------------------------------------------------
// Suite 5 — Empty / uninitialized form submit (Bug 8: comments.notReady toast)
// ---------------------------------------------------------------------------
test.describe("Document comments — empty form submit guard", () => {
  test.use({ storageState: TEST_USERS.admin.authFile });

  test("submit button is disabled when the form is empty", async ({ page }) => {
    await createDoc(page);
    await openCommentsPanel(page);

    // Without any text, the submit button must remain disabled (content guard
    // in DocumentCommentForm: `disabled={disabled || submitting || !content}`).
    const submitBtn = page.getByTestId("document-comment-submit");
    await expect(submitBtn).toBeDisabled({ timeout: 3000 });
  });

  test("pressing Enter on empty form does not create a comment", async ({
    page,
  }) => {
    await createDoc(page);
    await openCommentsPanel(page);

    const form = page.getByTestId("document-comment-form");
    const composer = form.locator('[contenteditable="true"]').first();
    await composer.click();

    // Press Enter without any text — the onEnter handler calls submit() which
    // returns early when content is falsy.
    await page.keyboard.press("Enter");

    // The empty-state message should still be shown (no comment was created).
    await expect(page.getByTestId("document-comments-empty")).toBeVisible({
      timeout: 3000,
    });
  });

  test("submitting while content is still a string shows notReady toast or rejects gracefully", async ({
    page,
  }) => {
    // This test approximates Bug 8. The scenario where `content` remains a
    // string (not yet parsed by TipTap's onChange) is difficult to reproduce
    // reliably in e2e because TipTap fires onChange synchronously after a
    // keyboard event in most builds. Instead we verify the observable outcome:
    // if somehow an empty-ish state reaches `submit()`, the form either shows
    // a toast OR stays intact without creating a comment.

    await createDoc(page);

    await openCommentsPanel(page);

    // Attempt to rapidly click submit right after opening — before any typing.
    const submitBtn = page.getByTestId("document-comment-submit");

    // The button is disabled on an empty form, so clicking it must be a no-op.
    // This also covers the "form not ready" guard.
    await expect(submitBtn).toBeDisabled();

    // Confirm no comments appeared.
    await expect(page.getByTestId("document-comments-empty")).toBeVisible({
      timeout: 3000,
    });
  });
});

// ---------------------------------------------------------------------------
// Suite 6 — AI reply button visibility
// ---------------------------------------------------------------------------
test.describe("Document comments — AI reply button", () => {
  // NOTE: Full AI reply flow (clicking the button, spinner, form pre-fill) is
  // covered by the "Document AI — comment reply" suite in document-ai.spec.ts.
  // This suite only verifies the button's presence once a comment exists.

  test.use({ storageState: TEST_USERS.admin.authFile });

  test("AI reply button is visible on an existing comment", async ({
    page,
  }) => {
    await createDoc(page);
    await openCommentsPanel(page);

    await addComment(page, "Comment that should have an AI reply button");

    const panel = page.getByTestId("document-comments-panel");

    // The AI reply button uses aria-label from i18n "comments.aiReply".
    // The button text / label typically contains "AI Reply" or similar.
    const aiReplyBtn = panel
      .getByRole("button", { name: /ai reply|ai-reply|reply with ai/i })
      .first();
    await expect(aiReplyBtn).toBeVisible({ timeout: 5000 });
  });

  test("human reply button is visible on an existing comment", async ({
    page,
  }) => {
    await createDoc(page);
    await openCommentsPanel(page);

    await addComment(page, "Comment that should have a human reply button");

    const panel = page.getByTestId("document-comments-panel");

    // The human Reply button is rendered for depth-0 comments.
    const replyBtn = panel.getByRole("button", { name: /^reply$/i }).first();
    await expect(replyBtn).toBeVisible({ timeout: 5000 });
  });

  test("AI reply button is absent on a reply (depth > 0)", async ({ page }) => {
    await createDoc(page);
    await openCommentsPanel(page);

    await addComment(page, "Parent comment for nested reply test");

    const panel = page.getByTestId("document-comments-panel");

    // Click the human Reply button to open a threaded reply.
    const replyBtn = panel.getByRole("button", { name: /^reply$/i }).first();
    await replyBtn.click();

    // Add the reply.
    const form = page.getByTestId("document-comment-form");
    const composer = form.locator('[contenteditable="true"]').first();
    await composer.click();
    await page.keyboard.type("Nested reply text");
    await page.getByTestId("document-comment-submit").click();

    await expect(
      panel.getByText("Nested reply text", { exact: false }),
    ).toBeVisible({ timeout: 10000 });

    // The nested reply (depth=1) must NOT have an AI reply or Reply button.
    // Count: only the parent's buttons should be present (1 AI reply, 1 Reply).
    const aiReplyBtns = panel.getByRole("button", {
      name: /ai reply|ai-reply|reply with ai/i,
    });
    // Only one AI reply button — on the parent (depth=0), not on the nested reply.
    await expect(aiReplyBtns).toHaveCount(1);
  });
});

// ---------------------------------------------------------------------------
// Suite 7 — Comment persistence across navigation
// ---------------------------------------------------------------------------
test.describe("Document comments — persistence", () => {
  test.use({ storageState: TEST_USERS.admin.authFile });

  test("comments survive navigating away and returning to the document", async ({
    page,
  }) => {
    await createDoc(page);
    const docUrl = page.url();

    await openCommentsPanel(page);

    const texts = [
      "Persistent comment one",
      "Persistent comment two",
      "Persistent comment three",
    ];
    for (const text of texts) {
      await addComment(page, text);
    }

    // Verify all three comments are showing before navigating away.
    const panel = page.getByTestId("document-comments-panel");
    for (const text of texts) {
      await expect(panel.getByText(text, { exact: false })).toBeVisible();
    }

    // Navigate away to the documents list.
    await page.goto("/documents");
    await expect(page).toHaveURL(/\/documents$/);

    // Navigate back to the same document.
    await page.goto(docUrl);
    await expect(page.getByTestId("document-title-input")).toBeVisible();

    // Re-open the comments panel.
    await openCommentsPanel(page);

    // All three comments must still be present (persisted to DB).
    const panelAfter = page.getByTestId("document-comments-panel");
    for (const text of texts) {
      await expect(panelAfter.getByText(text, { exact: false })).toBeVisible({
        timeout: 10000,
      });
    }
  });

  test("comment count badge reflects persisted comments", async ({ page }) => {
    await createDoc(page);

    await openCommentsPanel(page);

    await addComment(page, "Count badge comment A");
    await addComment(page, "Count badge comment B");

    // The panel header shows a comment count badge when total > 0.
    // The count is rendered as a <span> next to the "Comments" heading.
    const panel = page.getByTestId("document-comments-panel");

    // Wait until the count badge shows at least "2".
    await expect(async () => {
      const heading = await panel.locator("h2").textContent();
      const match = heading?.match(/(\d+)/);
      const count = match ? Number.parseInt(match[1], 10) : 0;
      expect(count).toBeGreaterThanOrEqual(2);
    }).toPass({ timeout: 10000 });
  });

  test("panel is empty on a brand-new document", async ({ page }) => {
    await createDoc(page);
    await openCommentsPanel(page);

    await expect(page.getByTestId("document-comments-empty")).toBeVisible({
      timeout: 8000,
    });
  });
});
