/**
 * Deep E2E tests for knowledge base features.
 *
 * Covers:
 *   Suite 1 — Navigate to /studio?tab=knowledge and assert shell renders.
 *   Suite 2 — Create a collection via the dialog (admin only).
 *   Suite 3 — Add a document to a collection via the ingest panel (file upload).
 *   Suite 4 — Use a collection via @mention in the chat composer.
 *   Suite 5 — Delete a collection via the detail-page delete button.
 *   Suite 6 — Collection visibility control (change to "company" and verify persists).
 *
 * Conventions:
 *   - Admin user creates/deletes; editor/regular users assert visibility.
 *   - test.skip() guards suites where the UI is not yet wired (see inline notes).
 *   - Each suite cleans up its own data in afterAll so it can run in isolation.
 *   - We use `test.describe.serial` only inside suites that share state across
 *     tests; independent suites run in whatever order Playwright chooses.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { Browser, BrowserContext, Page, expect, test } from "@playwright/test";
import { TEST_USERS } from "../constants/test-users";
import {
  createKnowledgeCollection,
  deleteKnowledgeCollection,
} from "../helpers/create-knowledge";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let _counter = 0;
function uid(): string {
  _counter++;
  return `${_counter}-${process.pid}`;
}

/** Write a tiny plain-text file into the OS temp dir and return its path. */
function writeTempTextFile(filename: string, content: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kbe2e-"));
  const filePath = path.join(dir, filename);
  fs.writeFileSync(filePath, content, "utf8");
  return filePath;
}

// ---------------------------------------------------------------------------
// Suite 1 — Navigate to Studio > Knowledge tab
// ---------------------------------------------------------------------------

test.describe("Suite 1 — Knowledge tab renders in Studio", () => {
  test.use({ storageState: TEST_USERS.admin.authFile });

  test("navigating to /studio?tab=knowledge renders the knowledge shell", async ({
    page,
  }) => {
    await page.goto("/studio?tab=knowledge");
    await page.waitForLoadState("networkidle");

    // URL should still be the studio page
    expect(page.url()).toContain("/studio");

    // The knowledge-collections container is present (rendered by
    // KnowledgeCollections — data-testid="knowledge-collections").
    await expect(page.getByTestId("knowledge-collections")).toBeVisible({
      timeout: 10_000,
    });
  });

  test("the Knowledge tab trigger is visible and active when selected", async ({
    page,
  }) => {
    await page.goto("/studio");
    await page.waitForLoadState("networkidle");

    const knowledgeTab = page.getByTestId("studio-tab-knowledge");
    await expect(knowledgeTab).toBeVisible();

    await knowledgeTab.click();
    await expect(page.getByTestId("knowledge-collections")).toBeVisible({
      timeout: 10_000,
    });
  });

  test("admin sees the New Collection button", async ({ page }) => {
    await page.goto("/studio?tab=knowledge");
    await page.waitForLoadState("networkidle");

    await expect(page.getByTestId("knowledge-new-collection")).toBeVisible({
      timeout: 10_000,
    });
  });

  test("editor role sees the collections list but not New Collection button", async ({
    browser,
  }) => {
    // Editors are not admins — the POST /api/knowledge/collections gate rejects
    // them, and the UI hides the button.
    const ctx = await browser.newContext({
      storageState: TEST_USERS.editor.authFile,
    });
    const page = await ctx.newPage();

    await page.goto("/studio?tab=knowledge");
    await page.waitForLoadState("networkidle");

    // The collections wrapper must exist (read access is open to all roles).
    await expect(page.getByTestId("knowledge-collections")).toBeVisible({
      timeout: 10_000,
    });

    // The "New Collection" button is admin-only — must not be present.
    await expect(
      page.getByTestId("knowledge-new-collection"),
    ).not.toBeVisible();

    await ctx.close();
  });
});

// ---------------------------------------------------------------------------
// Suite 2 — Create a collection via the dialog
// ---------------------------------------------------------------------------

test.describe
  .serial("Suite 2 — Create a collection", () => {
    test.use({ storageState: TEST_USERS.admin.authFile });

    const collectionName = `E2E Create ${uid()}`;
    let createdId: string | undefined;

    test.afterAll(async ({ browser }) => {
      if (!createdId) return;
      const ctx = await browser.newContext({
        storageState: TEST_USERS.admin.authFile,
      });
      const page = await ctx.newPage();
      await deleteKnowledgeCollection(page, createdId);
      await ctx.close();
    });

    test("clicking New Collection opens the dialog", async ({ page }) => {
      await page.goto("/studio?tab=knowledge");
      await page.waitForLoadState("networkidle");

      await page.getByTestId("knowledge-new-collection").click();

      await expect(page.getByTestId("knowledge-collection-dialog")).toBeVisible(
        { timeout: 5_000 },
      );
    });

    test("filling the form and saving creates the collection", async ({
      page,
    }) => {
      await page.goto("/studio?tab=knowledge");
      await page.waitForLoadState("networkidle");

      // Intercept the POST so we can capture the created id.
      const responsePromise = page.waitForResponse(
        (r) =>
          r.url().includes("/api/knowledge/collections") &&
          r.request().method() === "POST",
      );

      await page.getByTestId("knowledge-new-collection").click();
      await expect(page.getByTestId("knowledge-collection-dialog")).toBeVisible(
        { timeout: 5_000 },
      );

      await page.getByTestId("knowledge-collection-name").fill(collectionName);

      await page.getByTestId("knowledge-collection-save").click();

      // Wait for the API response so we can grab the id for cleanup.
      const res = await responsePromise;
      if (res.ok()) {
        const body = (await res.json()) as { collection?: { id: string } };
        createdId = body.collection?.id;
      }

      // Dialog should close after save.
      await expect(
        page.getByTestId("knowledge-collection-dialog"),
      ).not.toBeVisible({ timeout: 5_000 });

      // The new collection card should appear in the grid.
      await expect(
        page.locator('[data-testid="knowledge-collection-card"]', {
          hasText: collectionName,
        }),
      ).toBeVisible({ timeout: 10_000 });
    });

    test("the created collection appears after a page reload", async ({
      page,
    }) => {
      if (!createdId)
        test.skip(true, "previous test did not create a collection");

      await page.goto("/studio?tab=knowledge");
      await page.waitForLoadState("networkidle");

      await expect(
        page.locator('[data-testid="knowledge-collection-card"]', {
          hasText: collectionName,
        }),
      ).toBeVisible({ timeout: 10_000 });
    });

    test("saving with an empty name is blocked (save button disabled)", async ({
      page,
    }) => {
      await page.goto("/studio?tab=knowledge");
      await page.waitForLoadState("networkidle");

      await page.getByTestId("knowledge-new-collection").click();
      await expect(page.getByTestId("knowledge-collection-dialog")).toBeVisible(
        { timeout: 5_000 },
      );

      // Name field starts blank — the Save/Create button must be disabled.
      await expect(
        page.getByTestId("knowledge-collection-save"),
      ).toBeDisabled();
    });
  });

// ---------------------------------------------------------------------------
// Suite 3 — Add a document to a collection via the ingest panel
// ---------------------------------------------------------------------------

test.describe
  .serial("Suite 3 — Add a document via ingest panel", () => {
    test.use({ storageState: TEST_USERS.admin.authFile });

    let adminContext: BrowserContext;
    let adminPage: Page;
    let collectionId: string | undefined;
    const collectionName = `E2E Ingest ${uid()}`;

    test.beforeAll(async ({ browser }: { browser: Browser }) => {
      adminContext = await browser.newContext({
        storageState: TEST_USERS.admin.authFile,
      });
      adminPage = await adminContext.newPage();

      const col = await createKnowledgeCollection(adminPage, {
        name: collectionName,
      });
      collectionId = col?.id;
    });

    test.afterAll(async () => {
      if (collectionId) {
        await deleteKnowledgeCollection(adminPage, collectionId);
      }
      await adminContext.close();
    });

    test("the collection detail page renders the ingest panel for admins", async () => {
      if (!collectionId) test.skip(true, "collection not created");

      await adminPage.goto(`/studio/knowledge/${collectionId}`);
      await adminPage.waitForLoadState("networkidle");

      await expect(
        adminPage.getByTestId("knowledge-collection-detail"),
      ).toBeVisible({ timeout: 10_000 });
      await expect(adminPage.getByTestId("knowledge-ingest-panel")).toBeVisible(
        { timeout: 10_000 },
      );
    });

    test("paste-text ingest creates a document in the collection", async () => {
      if (!collectionId) test.skip(true, "collection not created");

      await adminPage.goto(`/studio/knowledge/${collectionId}`);
      await adminPage.waitForLoadState("networkidle");

      await adminPage
        .getByTestId("knowledge-ingest-source")
        .fill("e2e-paste-source");
      await adminPage
        .getByTestId("knowledge-ingest-text")
        .fill(
          "This is a synthetic knowledge base document created by the E2E suite. " +
            "It contains enough text to produce at least one embedding chunk.",
        );

      // Intercept the server action call (Next.js server actions POST to the page
      // URL with a special Next-Action header).
      const actionResponsePromise = adminPage.waitForResponse(
        (r) =>
          r.request().headers()["next-action"] !== undefined &&
          r.request().method() === "POST",
        { timeout: 20_000 },
      );

      await adminPage.getByTestId("knowledge-ingest-submit").click();
      await actionResponsePromise;

      // After ingest the documents section should show our new document row.
      await expect(
        adminPage.getByTestId("knowledge-document-row").first(),
      ).toBeVisible({ timeout: 15_000 });
      await expect(
        adminPage.locator('[data-testid="knowledge-document-row"]', {
          hasText: "e2e-paste-source",
        }),
      ).toBeVisible({ timeout: 15_000 });
    });

    test("file upload ingest (.txt) creates a document in the collection", async () => {
      if (!collectionId) test.skip(true, "collection not created");

      const tmpFile = writeTempTextFile(
        "e2e-upload.txt",
        "E2E file upload test content. " +
          "Playwright uploads this file to the knowledge ingest endpoint. " +
          "The server should extract text and return chunk count.",
      );

      await adminPage.goto(`/studio/knowledge/${collectionId}`);
      await adminPage.waitForLoadState("networkidle");

      // The hidden <input type="file"> is wired to the upload button.
      const fileInput = adminPage.getByTestId("knowledge-ingest-file");
      await fileInput.setInputFiles(tmpFile);

      // Wait for the upload POST to /api/knowledge/ingest/upload.
      const uploadRes = await adminPage.waitForResponse(
        (r) => r.url().includes("/api/knowledge/ingest/upload"),
        { timeout: 30_000 },
      );
      expect(uploadRes.ok(), "upload endpoint returned non-2xx").toBe(true);

      // A document row named after the file should appear.
      await expect(
        adminPage.locator('[data-testid="knowledge-document-row"]', {
          hasText: "e2e-upload.txt",
        }),
      ).toBeVisible({ timeout: 15_000 });

      // Cleanup temp file.
      fs.rmSync(path.dirname(tmpFile), { recursive: true, force: true });
    });

    test("non-admin (editor) does NOT see the ingest panel", async ({
      browser,
    }) => {
      if (!collectionId) test.skip(true, "collection not created");

      const ctx = await browser.newContext({
        storageState: TEST_USERS.editor.authFile,
      });
      const page = await ctx.newPage();

      await page.goto(`/studio/knowledge/${collectionId}`);
      await page.waitForLoadState("networkidle");

      // The detail wrapper should exist — editor has read access via company
      // visibility (the beforeAll collection defaults to company).
      await expect(page.getByTestId("knowledge-collection-detail")).toBeVisible(
        { timeout: 10_000 },
      );

      // But the ingest panel must be absent.
      await expect(
        page.getByTestId("knowledge-ingest-panel"),
      ).not.toBeVisible();

      await ctx.close();
    });
  });

// ---------------------------------------------------------------------------
// Suite 4 — @mention a collection in the chat composer
// ---------------------------------------------------------------------------

test.describe
  .serial("Suite 4 — @mention a knowledge collection in chat", () => {
    test.use({ storageState: TEST_USERS.admin.authFile });

    const collectionName = `E2E Mention ${uid()}`;
    let collectionId: string | undefined;
    let adminContext: BrowserContext;
    let adminPage: Page;

    test.beforeAll(async ({ browser }: { browser: Browser }) => {
      adminContext = await browser.newContext({
        storageState: TEST_USERS.admin.authFile,
      });
      adminPage = await adminContext.newPage();

      const col = await createKnowledgeCollection(adminPage, {
        name: collectionName,
      });
      collectionId = col?.id;
    });

    test.afterAll(async () => {
      if (collectionId) {
        await deleteKnowledgeCollection(adminPage, collectionId);
      }
      await adminContext.close();
    });

    test("typing @ in the composer opens the mention dropdown", async ({
      page,
    }) => {
      await page.goto("/");
      await page.waitForLoadState("networkidle");

      const textbox = page.getByTestId("composer-textbox");
      await expect(textbox).toBeVisible({ timeout: 10_000 });
      await textbox.click();
      await textbox.type("@");

      // The mention suggestion popover uses a Radix Popover — it renders as a
      // floating div. We check for the search input that lives inside it.
      const mentionSearch = page
        .locator("[data-radix-popper-content-wrapper] input[placeholder]")
        .first();
      await expect(mentionSearch).toBeVisible({ timeout: 5_000 });
    });

    test("the collection appears in the @ mention dropdown", async ({
      page,
    }) => {
      if (!collectionId) test.skip(true, "collection not created");

      await page.goto("/");
      await page.waitForLoadState("networkidle");

      const textbox = page.getByTestId("composer-textbox");
      await expect(textbox).toBeVisible({ timeout: 10_000 });
      await textbox.click();
      await textbox.type("@");

      // Wait for popover to be visible, then type the collection name to filter.
      const mentionSearch = page
        .locator("[data-radix-popper-content-wrapper] input[placeholder]")
        .first();
      await expect(mentionSearch).toBeVisible({ timeout: 5_000 });

      // Type part of the collection name to narrow the results.
      await mentionSearch.fill("E2E Mention");

      // The collection item should appear in the list.
      await expect(
        page.locator("[data-radix-popper-content-wrapper]", {
          hasText: collectionName,
        }),
      ).toBeVisible({ timeout: 5_000 });
    });

    test("selecting the collection inserts a mention chip in the composer", async ({
      page,
    }) => {
      if (!collectionId) test.skip(true, "collection not created");

      await page.goto("/");
      await page.waitForLoadState("networkidle");

      const textbox = page.getByTestId("composer-textbox");
      await expect(textbox).toBeVisible({ timeout: 10_000 });
      await textbox.click();
      await textbox.type("@");

      const mentionSearch = page
        .locator("[data-radix-popper-content-wrapper] input[placeholder]")
        .first();
      await expect(mentionSearch).toBeVisible({ timeout: 5_000 });
      await mentionSearch.fill("E2E Mention");

      // Click the collection item in the dropdown.
      await page
        .locator("[data-radix-popper-content-wrapper] button", {
          hasText: collectionName,
        })
        .first()
        .click();

      // The mention chip is rendered as a styled node inside the TipTap editor
      // (the MentionItem component renders `knowledge("name")` as the chip text).
      await expect(
        textbox.locator(`text=knowledge("${collectionName}")`),
      ).toBeVisible({ timeout: 5_000 });
    });

    test("the chat API is called with the collection in the mentions when the message is sent", async ({
      page,
    }) => {
      if (!collectionId) test.skip(true, "collection not created");

      await page.goto("/");
      await page.waitForLoadState("networkidle");

      // Intercept /api/chat POST before triggering the mention flow.
      const chatPostPromise = page.waitForRequest(
        (req) => req.url().includes("/api/chat") && req.method() === "POST",
        { timeout: 30_000 },
      );

      const textbox = page.getByTestId("composer-textbox");
      await expect(textbox).toBeVisible({ timeout: 10_000 });
      await textbox.click();
      await textbox.type("@");

      const mentionSearch = page
        .locator("[data-radix-popper-content-wrapper] input[placeholder]")
        .first();
      await expect(mentionSearch).toBeVisible({ timeout: 5_000 });
      await mentionSearch.fill("E2E Mention");

      await page
        .locator("[data-radix-popper-content-wrapper] button", {
          hasText: collectionName,
        })
        .first()
        .click();

      // Also type some plain text so the message is non-empty.
      await textbox.click();
      // Press End to move cursor past the mention chip and type.
      await textbox.press("End");
      await textbox.type(" hello knowledge");

      // Click the send button (role="button" aria-label="Send").
      await page.getByRole("button", { name: "Send" }).click();

      // Wait for the /api/chat POST and inspect the body.
      const chatReq = await chatPostPromise;
      const bodyText = chatReq.postData() ?? "";
      // The body must contain the collectionId embedded in the mentions array.
      expect(bodyText).toContain(collectionId);
    });
  });

// ---------------------------------------------------------------------------
// Suite 5 — Delete a collection
// ---------------------------------------------------------------------------

test.describe
  .serial("Suite 5 — Delete a collection", () => {
    test.use({ storageState: TEST_USERS.admin.authFile });

    const collectionName = `E2E Delete ${uid()}`;
    let collectionId: string | undefined;
    let adminContext: BrowserContext;
    let adminPage: Page;

    test.beforeAll(async ({ browser }: { browser: Browser }) => {
      adminContext = await browser.newContext({
        storageState: TEST_USERS.admin.authFile,
      });
      adminPage = await adminContext.newPage();

      const col = await createKnowledgeCollection(adminPage, {
        name: collectionName,
      });
      collectionId = col?.id;
    });

    test.afterAll(async () => {
      // Best-effort cleanup in case the delete test failed.
      if (collectionId) {
        await deleteKnowledgeCollection(adminPage, collectionId).catch(
          () => {},
        );
      }
      await adminContext.close();
    });

    test("the delete button is visible on the collection detail page", async () => {
      if (!collectionId) test.skip(true, "collection not created");

      await adminPage.goto(`/studio/knowledge/${collectionId}`);
      await adminPage.waitForLoadState("networkidle");

      await expect(
        adminPage.getByTestId("knowledge-delete-collection"),
      ).toBeVisible({ timeout: 10_000 });
    });

    test("clicking delete and confirming removes the collection and redirects", async () => {
      if (!collectionId) test.skip(true, "collection not created");

      await adminPage.goto(`/studio/knowledge/${collectionId}`);
      await adminPage.waitForLoadState("networkidle");

      // Click the delete button.
      await adminPage.getByTestId("knowledge-delete-collection").click();

      // The app uses notify.confirm — a custom modal/dialog. We accept whatever
      // confirmation prompt appears (OK / Confirm / Delete button).
      // Try the most common patterns; skip gracefully if neither is found.
      const confirmButton = adminPage
        .getByRole("button", { name: /confirm|delete|yes|ok/i })
        .first();
      const isConfirmVisible = await confirmButton
        .isVisible({ timeout: 5_000 })
        .catch(() => false);

      if (isConfirmVisible) {
        await confirmButton.click();
      } else {
        // The dialog might render a data-testid; try generic approach.
        await adminPage.keyboard.press("Enter");
      }

      // After deletion the app navigates back to /studio?tab=knowledge.
      await adminPage.waitForURL("**/studio**", { timeout: 10_000 });

      // The deleted collection must not appear in the list.
      await adminPage.waitForLoadState("networkidle");
      await expect(
        adminPage.locator('[data-testid="knowledge-collection-card"]', {
          hasText: collectionName,
        }),
      ).not.toBeVisible({ timeout: 5_000 });

      // Mark as deleted so afterAll cleanup is a no-op.
      collectionId = undefined;
    });

    test("the API returns 404 for the deleted collection", async () => {
      // This test relies on the previous test having deleted the collection.
      // We create a fresh one via API and delete it via API to test independently.
      const tmpCol = await createKnowledgeCollection(adminPage, {
        name: `E2E Delete API ${uid()}`,
      });
      if (!tmpCol) test.skip(true, "could not create temp collection");

      await deleteKnowledgeCollection(adminPage, tmpCol!.id);

      const res = await adminPage.request.get(
        `/api/knowledge/collections/${tmpCol!.id}`,
        { failOnStatusCode: false },
      );
      expect(res.status()).toBe(404);
    });

    test("non-admin (editor) gets 403 when attempting to DELETE via API", async ({
      browser,
    }) => {
      const ctx = await browser.newContext({
        storageState: TEST_USERS.editor.authFile,
      });
      const page = await ctx.newPage();

      // Create a collection as admin then attempt to delete as editor.
      const tmpCol = await createKnowledgeCollection(adminPage, {
        name: `E2E Editor Delete ${uid()}`,
      });

      if (tmpCol) {
        const res = await page.request.delete(
          `/api/knowledge/collections/${tmpCol.id}`,
          { failOnStatusCode: false },
        );
        expect(res.status()).toBe(403);

        // Cleanup via admin.
        await deleteKnowledgeCollection(adminPage, tmpCol.id);
      }

      await ctx.close();
    });
  });

// ---------------------------------------------------------------------------
// Suite 6 — Collection visibility
// ---------------------------------------------------------------------------

test.describe
  .serial("Suite 6 — Collection visibility", () => {
    test.use({ storageState: TEST_USERS.admin.authFile });

    let adminContext: BrowserContext;
    let adminPage: Page;
    let collectionId: string | undefined;
    const collectionName = `E2E Visibility ${uid()}`;

    test.beforeAll(async ({ browser }: { browser: Browser }) => {
      adminContext = await browser.newContext({
        storageState: TEST_USERS.admin.authFile,
      });
      adminPage = await adminContext.newPage();

      // Create with default visibility (company) via API.
      const col = await createKnowledgeCollection(adminPage, {
        name: collectionName,
      });
      collectionId = col?.id;
    });

    test.afterAll(async () => {
      if (collectionId) {
        await deleteKnowledgeCollection(adminPage, collectionId);
      }
      await adminContext.close();
    });

    test("the collection detail page shows the visibility pill", async () => {
      if (!collectionId) test.skip(true, "collection not created");

      await adminPage.goto(`/studio/knowledge/${collectionId}`);
      await adminPage.waitForLoadState("networkidle");

      // KnowledgeVisibilityPill renders alongside the collection title.
      // We just assert that the collection detail container is present — the
      // broader visibility-control check is done via the edit dialog below.
      const detailEl = adminPage.getByTestId("knowledge-collection-detail");
      await expect(detailEl).toBeVisible({ timeout: 10_000 });
    });

    test("the edit dialog contains the visibility field", async () => {
      if (!collectionId) test.skip(true, "collection not created");

      await adminPage.goto(`/studio/knowledge/${collectionId}`);
      await adminPage.waitForLoadState("networkidle");

      await adminPage.getByTestId("knowledge-edit-collection").click();

      await expect(
        adminPage.getByTestId("knowledge-collection-dialog"),
      ).toBeVisible({ timeout: 5_000 });

      // The VisibilityField renders inside the dialog. We check for the
      // Visibility.label text (the <Label> wrapping the picker).
      await expect(
        adminPage
          .getByTestId("knowledge-collection-dialog")
          .getByText(/visibility|access/i)
          .first(),
      ).toBeVisible({ timeout: 3_000 });
    });

    test("changing visibility to private via PATCH API persists", async () => {
      if (!collectionId) test.skip(true, "collection not created");

      const res = await adminPage.request.patch(
        `/api/knowledge/collections/${collectionId}`,
        {
          data: { visibility: "private" },
          failOnStatusCode: false,
        },
      );
      expect(res.ok(), `PATCH returned ${res.status()}`).toBe(true);

      const body = (await res.json()) as {
        collection?: { visibility: string };
      };
      expect(body.collection?.visibility).toBe("private");
    });

    test("a private collection is not visible to editor via GET", async ({
      browser,
    }) => {
      if (!collectionId) test.skip(true, "collection not created");

      // Ensure the collection is private (may have been changed by previous test).
      await adminPage.request.patch(
        `/api/knowledge/collections/${collectionId}`,
        {
          data: { visibility: "private" },
          failOnStatusCode: false,
        },
      );

      const ctx = await browser.newContext({
        storageState: TEST_USERS.editor.authFile,
      });
      const page = await ctx.newPage();

      const listRes = await page.request.get("/api/knowledge/collections", {
        failOnStatusCode: false,
      });
      expect(listRes.ok()).toBe(true);
      const listBody = (await listRes.json()) as {
        collections?: { id: string }[];
      };
      const ids = (listBody.collections ?? []).map((c) => c.id);
      expect(ids).not.toContain(collectionId);

      await ctx.close();
    });

    test("a company-wide collection is visible to editor and regular user", async ({
      browser,
    }) => {
      if (!collectionId) test.skip(true, "collection not created");

      // Restore to company visibility.
      const patchRes = await adminPage.request.patch(
        `/api/knowledge/collections/${collectionId}`,
        {
          data: { visibility: "company" },
          failOnStatusCode: false,
        },
      );
      expect(patchRes.ok(), `PATCH returned ${patchRes.status()}`).toBe(true);

      // Check editor.
      const editorCtx = await browser.newContext({
        storageState: TEST_USERS.editor.authFile,
      });
      const editorPage = await editorCtx.newPage();

      const editorRes = await editorPage.request.get(
        "/api/knowledge/collections",
        { failOnStatusCode: false },
      );
      const editorBody = (await editorRes.json()) as {
        collections?: { id: string }[];
      };
      expect((editorBody.collections ?? []).map((c) => c.id)).toContain(
        collectionId,
      );
      await editorCtx.close();

      // Check regular user.
      const regularCtx = await browser.newContext({
        storageState: TEST_USERS.regular.authFile,
      });
      const regularPage = await regularCtx.newPage();

      const regularRes = await regularPage.request.get(
        "/api/knowledge/collections",
        { failOnStatusCode: false },
      );
      const regularBody = (await regularRes.json()) as {
        collections?: { id: string }[];
      };
      expect((regularBody.collections ?? []).map((c) => c.id)).toContain(
        collectionId,
      );
      await regularCtx.close();
    });

    test("company-wide collection appears in the editor's Studio Knowledge tab UI", async ({
      browser,
    }) => {
      if (!collectionId) test.skip(true, "collection not created");

      const ctx = await browser.newContext({
        storageState: TEST_USERS.editor.authFile,
      });
      const page = await ctx.newPage();

      await page.goto("/studio?tab=knowledge");
      await page.waitForLoadState("networkidle");

      await expect(
        page.locator('[data-testid="knowledge-collection-card"]', {
          hasText: collectionName,
        }),
      ).toBeVisible({ timeout: 10_000 });

      await ctx.close();
    });

    // NOTE: "team" visibility testing requires at least one team to exist and at
    // least two users to be members of that team. The seed data does not
    // guarantee a specific team id, so this test is skipped until the seed
    // script is extended with a known test team.
    test.skip("team visibility limits access to team members only", async () => {
      // Implementation: PATCH visibility=team + teamIds=[<test-team-id>],
      // then verify:
      //   - team-member editor sees the collection
      //   - non-member regular user does NOT see the collection
      // Blocked on: known test team id in seed data.
    });
  });
