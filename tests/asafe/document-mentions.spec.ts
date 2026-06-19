import { type Page, expect, test } from "@playwright/test";
import { TEST_USERS } from "../constants/test-users";

// @mention in document comments — end-to-end UI path.
//
// Two personas:
//   author (admin)  — creates the document and posts the @mention comment
//   recipient (editor) — the user who gets mentioned
//
// NOTE: never wait for networkidle on a document page — DocumentLive holds
// an Electric long-poll open.  Use explicit testid waits instead.

async function createDoc(page: Page): Promise<string> {
  await page.goto("/documents");
  await page.getByTestId("document-new").click();
  await expect(page).toHaveURL(/\/documents\/[0-9a-f-]{36}/);
  await expect(page.getByTestId("document-title-input")).toBeVisible();
  return page.url();
}

test.describe("Document comments — @mention flow", () => {
  test.use({ storageState: TEST_USERS.admin.authFile });

  test("typing @ in the comment composer triggers the user suggestion popup", async ({
    page,
  }) => {
    await createDoc(page);

    // Open the comments panel.
    await page.getByTestId("document-comments-toggle").click();
    await expect(page.getByTestId("document-comments-panel")).toBeVisible();

    // The comment composer is a TipTap contenteditable (via MentionInput).
    const composer = page
      .getByTestId("document-comment-form")
      .locator('[contenteditable="true"]')
      .first();
    await composer.click();

    // Type "@" — this should open the user mention suggestion popover.
    await page.keyboard.type("@");

    // The suggestion popup (UserMentionSuggestion) must appear.
    await expect(
      page.locator("[data-testid='mention-suggestion'], [role='listbox'], [role='menu']").first(),
    ).toBeVisible({ timeout: 5000 });
  });

  test("@ + query filters users and selecting inserts a chip", async ({
    page,
  }) => {
    await createDoc(page);

    await page.getByTestId("document-comments-toggle").click();
    await expect(page.getByTestId("document-comments-panel")).toBeVisible();

    const composer = page
      .getByTestId("document-comment-form")
      .locator('[contenteditable="true"]')
      .first();
    await composer.click();

    // Type "@Te" to search for "Test" (matches "Test Editor User").
    await page.keyboard.type("@Te");

    // Wait for the suggestion list to appear.
    const suggestionList = page
      .locator("[data-testid='mention-suggestion'], [role='listbox'], [role='menu']")
      .first();
    await expect(suggestionList).toBeVisible({ timeout: 5000 });

    // Click the first item to select it.
    const firstItem = suggestionList.locator("li, [role='option'], button").first();
    await firstItem.click();

    // The chip should now appear in the composer — @Name rendered as a span/node.
    await expect(
      composer.locator("[data-type='mention'], .mention, [data-mention]").first(),
    ).toBeVisible();
  });

  test("submitting a comment with @mention stores and displays it", async ({
    page,
  }) => {
    await createDoc(page);

    await page.getByTestId("document-comments-toggle").click();
    await expect(page.getByTestId("document-comments-panel")).toBeVisible();

    const form = page.getByTestId("document-comment-form");
    const composer = form.locator('[contenteditable="true"]').first();
    await composer.click();

    // Type plain text then an @mention.
    await page.keyboard.type("Hello ");
    await page.keyboard.type("@Te");

    const suggestionList = page
      .locator("[data-testid='mention-suggestion'], [role='listbox'], [role='menu']")
      .first();
    await expect(suggestionList).toBeVisible({ timeout: 5000 });

    // Select first suggestion with Enter.
    await page.keyboard.press("Enter");

    // Add trailing text.
    await page.keyboard.type(" see this!");

    await page.getByTestId("document-comment-submit").click();

    // The submitted comment thread entry should be visible.
    await expect(
      page.getByText("Hello", { exact: false }),
    ).toBeVisible({ timeout: 8000 });
  });

  test("comment renders without @mention when disabledMention is not set", async ({
    page,
  }) => {
    await createDoc(page);

    await page.getByTestId("document-comments-toggle").click();
    await expect(page.getByTestId("document-comments-panel")).toBeVisible();

    const form = page.getByTestId("document-comment-form");
    const input = form
      .locator('[contenteditable="true"], textarea, input[type=text]')
      .first();
    await input.click();
    await input.fill("Plain comment no mention");
    await page.getByTestId("document-comment-submit").click();
    await expect(
      page.getByText("Plain comment no mention", { exact: false }),
    ).toBeVisible();
  });
});
