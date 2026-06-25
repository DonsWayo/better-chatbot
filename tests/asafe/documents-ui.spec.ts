import { type Page, expect, test } from "@playwright/test";
import { TEST_USERS } from "../constants/test-users";

// Full document surface via the UI (the Server-Action autosave path the API
// tests can't reach). Owner = admin. NOTE: never wait for networkidle on a
// document page — DocumentLive holds an Electric long-poll open, so use
// explicit testid waits instead.

// Create a fresh document from the /documents list page (the sidebar "+" lives
// inside the cmdk command palette, which intercepts pointer events headless).
async function createDoc(page: Page): Promise<string> {
  await page.goto("/documents");
  await page.getByTestId("document-new").click();
  await expect(page).toHaveURL(/\/documents\/[0-9a-f-]{36}/);
  await expect(page.getByTestId("document-title-input")).toBeVisible();
  return page.url();
}

test.describe("Documents — editor surface", () => {
  test.use({ storageState: TEST_USERS.admin.authFile });

  test("create → edit → autosave persists across reload", async ({ page }) => {
    const docUrl = await createDoc(page);

    const title = `e2e-doc-${Date.now()}`;
    const body = `Body written by the documents e2e at ${Date.now()}.`;

    await page.getByTestId("document-title-input").fill(title);
    await page.locator(".ProseMirror").click();
    await page.locator(".ProseMirror").fill(body);

    // Let the debounced autosave flush, then prove persistence with a reload.
    await page.waitForTimeout(2500);
    await page.goto(docUrl);
    await expect(page.getByTestId("document-title-input")).toHaveValue(title);
    await expect(page.locator(".ProseMirror")).toContainText(body);
  });

  test("owner sees manage controls (delete, visibility, history, comments)", async ({
    page,
  }) => {
    await createDoc(page);
    await expect(page.getByTestId("document-delete")).toBeVisible();
    await expect(page.getByTestId("document-visibility-trigger")).toBeVisible();
    await expect(page.getByTestId("document-history-toggle")).toBeVisible();
    await expect(page.getByTestId("document-comments-toggle")).toBeVisible();
    await expect(page.getByTestId("document-toolbar")).toBeVisible();
  });

  test("comments: panel opens and a comment can be added", async ({ page }) => {
    await createDoc(page);
    await page.getByTestId("document-comments-toggle").click();
    await expect(page.getByTestId("document-comments-panel")).toBeVisible();

    const form = page.getByTestId("document-comment-form");
    await expect(form).toBeVisible();
    // The comment input is a MentionInput (contenteditable), not a textarea.
    const input = form
      .locator('[contenteditable="true"], textarea, input[type=text]')
      .first();
    await input.click();
    await input.fill("First comment from e2e");
    await page.getByTestId("document-comment-submit").click();
    await expect(
      page.getByText("First comment from e2e", { exact: false }),
    ).toBeVisible();
  });

  test("version history: a version can be saved and the panel lists it", async ({
    page,
  }) => {
    await createDoc(page);

    await page.locator(".ProseMirror").click();
    await page.locator(".ProseMirror").fill("Versioned content from e2e.");
    await page.waitForTimeout(1500);

    await page.getByTestId("document-history-toggle").click();
    await expect(page.getByTestId("document-history-panel")).toBeVisible();
    await page.getByTestId("document-save-version").click();
    await expect(page.getByTestId("document-history-empty")).toBeHidden();
  });
});
