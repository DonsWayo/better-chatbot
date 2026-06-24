/**
 * E2E tests for document creation error handling and sidebar navigation.
 *
 *  1. Sidebar "+" button navigates to a new document
 *  2. "New Document" button re-enables after a server-action failure (try/catch fix)
 *  3. Error toast is shown when creation fails
 *  4. Empty-state "New Document" button works
 *  5. Rapid double-click only creates one document (button disabled during creation)
 *  6. Created document URL matches UUID format
 *
 * NOTE: never wait for networkidle on a document page — DocumentLive holds
 * an Electric long-poll open. Use explicit testid / selector waits instead.
 *
 * Server Action failures are simulated by intercepting POST requests that
 * carry a `next-action` header (the Next.js Server Actions wire protocol).
 */

import { type Page, expect, test } from "@playwright/test";
import { TEST_USERS } from "../constants/test-users";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Intercept all Next.js Server Action calls to any URL and respond with a 500.
 * Server Actions are distinguished by the `next-action` request header.
 */
async function mockServerActionFailure(page: Page) {
  await page.route("**", async (route) => {
    const headers = route.request().headers();
    if (headers["next-action"]) {
      await route.fulfill({
        status: 500,
        body: "Internal Server Error",
      });
    } else {
      await route.continue();
    }
  });
}

// ---------------------------------------------------------------------------
// Suite 1 — Sidebar new document navigates correctly
// ---------------------------------------------------------------------------
test.describe("Sidebar new document", () => {
  test.use({ storageState: TEST_USERS.admin.authFile });

  test("sidebar + button navigates to a new document", async ({ page }) => {
    await page.goto("/");

    // The sidebar Documents section has a hover-revealed "+" button.
    // Hover over the group to make the button visible.
    // Force-hover the parent group so opacity-0 → opacity-100 transition fires.
    await page
      .locator(".group\\/documents")
      .first()
      .hover({ force: true })
      .catch(() => {
        // If the selector isn't found (e.g. sidebar collapsed), that's OK —
        // we fall back to forcing the button click directly.
      });

    const newBtn = page.getByTestId("sidebar-document-new");
    // Use force:true because the button starts at opacity-0 and the CSS
    // transition may not complete before Playwright checks visibility.
    await newBtn.click({ force: true });

    await expect(page).toHaveURL(/\/documents\/[0-9a-f-]{36}/, {
      timeout: 10_000,
    });
    await expect(page.getByTestId("document-title-input")).toBeVisible({
      timeout: 10_000,
    });
  });
});

// ---------------------------------------------------------------------------
// Suite 2 — Button re-enables after creation failure (documents page)
// ---------------------------------------------------------------------------
test.describe("New Document button re-enables after error", () => {
  test.use({ storageState: TEST_USERS.admin.authFile });

  test("button is re-enabled and error toast is shown after server 500", async ({
    page,
  }) => {
    await page.goto("/documents");

    // Wait for the page to fully load before installing the route interceptor
    // so the list itself can render without being blocked.
    await page
      .getByTestId("document-new")
      .waitFor({ state: "visible", timeout: 10_000 });

    // Install the failure mock AFTER the page list has loaded.
    await mockServerActionFailure(page);

    const btn = page.getByTestId("document-new");

    // Button must be enabled before the click.
    await expect(btn).toBeEnabled();

    await btn.click();

    // During the async call the button is disabled (creating = true).
    // After the error resolves the finally block sets creating = false.
    // We just wait for it to be re-enabled — allow a generous timeout for
    // the network round-trip + error branch.
    await expect(btn).toBeEnabled({ timeout: 10_000 });

    // An error toast must appear ("Couldn't create document" or the i18n key
    // "Documents.createError" rendered to the user's locale string).
    await expect(
      page.locator("[data-sonner-toast]").filter({ hasText: /creat/i }),
    ).toBeVisible({ timeout: 8_000 });
  });
});

// ---------------------------------------------------------------------------
// Suite 3 — Sidebar button re-enables after error
// ---------------------------------------------------------------------------
test.describe("Sidebar new document re-enables after error", () => {
  test.use({ storageState: TEST_USERS.admin.authFile });

  test("sidebar + button re-enables and shows toast after server 500", async ({
    page,
  }) => {
    await page.goto("/");

    // Wait for the sidebar to load.
    await page
      .getByTestId("sidebar-document-new")
      .waitFor({ state: "attached", timeout: 10_000 });

    // Install failure mock after initial sidebar data loads.
    await mockServerActionFailure(page);

    const btn = page.getByTestId("sidebar-document-new");

    // Click — force because the button is opacity-0 until hover.
    await btn.click({ force: true });

    // After the error the button must be re-enabled.
    await expect(btn).toBeEnabled({ timeout: 10_000 });

    // Error toast must appear.
    await expect(
      page.locator("[data-sonner-toast]").filter({ hasText: /creat/i }),
    ).toBeVisible({ timeout: 8_000 });
  });
});

// ---------------------------------------------------------------------------
// Suite 4 — Creating a document from the empty state
// ---------------------------------------------------------------------------
test.describe("Empty state new document", () => {
  // Use editor2 — less likely to have pre-existing documents, reducing
  // the chance that the empty state is bypassed.  If the user does have
  // documents the test still works via the header button.
  test.use({ storageState: TEST_USERS.editor2.authFile });

  test("empty-state action button navigates to a new document", async ({
    page,
  }) => {
    await page.goto("/documents");

    // If the empty state is present, use its action button; otherwise use the
    // header-level "New Document" button (same underlying handler).
    const emptyState = page.getByTestId("documents-empty");
    const headerBtn = page.getByTestId("document-new");

    const isEmptyVisible = await emptyState.isVisible().catch(() => false);

    if (isEmptyVisible) {
      // Click the button rendered inside the EmptyState component.
      await emptyState.getByRole("button").click();
    } else {
      await headerBtn.click();
    }

    await expect(page).toHaveURL(/\/documents\/[0-9a-f-]{36}/, {
      timeout: 10_000,
    });
    await expect(page.getByTestId("document-title-input")).toBeVisible({
      timeout: 10_000,
    });
  });
});

// ---------------------------------------------------------------------------
// Suite 5 — Rapid double-click only creates one document
// ---------------------------------------------------------------------------
test.describe("Rapid clicks do not create multiple documents", () => {
  test.use({ storageState: TEST_USERS.admin.authFile });

  test("double-clicking New Document navigates to exactly one document", async ({
    page,
  }) => {
    await page.goto("/documents");

    const btn = page.getByTestId("document-new");
    await expect(btn).toBeEnabled({ timeout: 10_000 });

    // Rapid double-click.
    await btn.dblclick();

    // The button should be disabled immediately after the first click
    // (creating = true) which prevents the second click from firing a
    // second server action.
    // We just assert we end up on ONE document URL, not two.
    await expect(page).toHaveURL(/\/documents\/[0-9a-f-]{36}/, {
      timeout: 10_000,
    });

    // URL must be stable (not change to a second document within 2 seconds).
    const firstUrl = page.url();
    await page.waitForTimeout(2_000);
    expect(page.url()).toBe(firstUrl);
  });
});

// ---------------------------------------------------------------------------
// Suite 6 — Document URL pattern validation
// ---------------------------------------------------------------------------
test.describe("Document URL UUID format", () => {
  test.use({ storageState: TEST_USERS.admin.authFile });

  test("created document URL contains a valid 36-character UUID", async ({
    page,
  }) => {
    await page.goto("/documents");
    await page.getByTestId("document-new").click();

    await expect(page).toHaveURL(/\/documents\/[0-9a-f-]{36}/, {
      timeout: 10_000,
    });

    const url = page.url();
    // Extract the ID segment after /documents/
    const match = url.match(/\/documents\/([0-9a-f-]{36})/);
    expect(match).not.toBeNull();

    const docId = match![1];
    // Must be exactly 36 characters (8-4-4-4-12 UUID format).
    expect(docId).toHaveLength(36);
    // Must match the full UUID pattern.
    expect(docId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });
});
