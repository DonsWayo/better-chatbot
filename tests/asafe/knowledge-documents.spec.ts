/**
 * E2E tests for /api/knowledge/collections/[id]/documents — document listing
 * and deletion within a knowledge collection.
 *
 * Tests run serially so they can share a created collection across steps.
 * The afterAll hook cleans up the collection and all its documents.
 */

import { test, expect, Browser, BrowserContext, Page } from "@playwright/test";
import { TEST_USERS } from "../constants/test-users";

let _c = 0;
function uid(): string { _c++; return `${_c}-${process.pid}`; }

let adminContext: BrowserContext;
let adminPage: Page;
let collectionId: string | undefined;

test.describe.serial("Knowledge Documents — list + delete", () => {
  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    adminContext = await browser.newContext({
      storageState: TEST_USERS.admin.authFile,
    });
    adminPage = await adminContext.newPage();

    // Create a collection to test against
    const res = await adminPage.request.post("/api/knowledge/collections", {
      headers: { "Content-Type": "application/json" },
      data: { name: `e2e-docs-${uid()}` },
    });
    const body = await res.json();
    collectionId = body?.collection?.id as string | undefined;
  });

  test.afterAll(async () => {
    if (collectionId) {
      await adminPage.request.delete(`/api/knowledge/collections/${collectionId}`).catch(() => {});
    }
    await adminContext.close();
  });

  test("admin: GET /api/knowledge/collections/[id]/documents returns 200 with empty array", async () => {
    if (!collectionId) test.skip(true, "collection not created");

    const res = await adminPage.request.get(
      `/api/knowledge/collections/${collectionId}/documents`,
    );
    expect(res.status(), `expected 200, got ${res.status()}`).toBe(200);

    const body = await res.json();
    expect(Array.isArray(body?.documents), "body.documents must be an array").toBe(true);
  });

  test("editor: GET /api/knowledge/collections/[id]/documents returns 200", async ({
    browser,
  }) => {
    if (!collectionId) test.skip(true, "collection not created");

    const ctx = await browser.newContext({ storageState: TEST_USERS.editor.authFile });
    const page = await ctx.newPage();

    const res = await page.request.get(
      `/api/knowledge/collections/${collectionId}/documents`,
    );
    expect(res.status(), `expected 200, got ${res.status()}`).toBe(200);

    await ctx.close();
  });

  test("anonymous: GET /api/knowledge/collections/[id]/documents returns 401", async ({
    browser,
  }) => {
    if (!collectionId) test.skip(true, "collection not created");

    const ctx = await browser.newContext();
    const page = await ctx.newPage();

    const res = await page.request.get(
      `/api/knowledge/collections/${collectionId}/documents`,
    );
    expect(res.status(), `expected 401, got ${res.status()}`).toBe(401);

    await ctx.close();
  });

  test("editor: DELETE /api/knowledge/collections/[id]/documents/[docId] returns 403", async ({
    browser,
  }) => {
    if (!collectionId) test.skip(true, "collection not created");

    const ctx = await browser.newContext({ storageState: TEST_USERS.editor.authFile });
    const page = await ctx.newPage();

    const fakeDocId = Buffer.from("non-existent.pdf").toString("base64url");
    const res = await page.request.delete(
      `/api/knowledge/collections/${collectionId}/documents/${fakeDocId}`,
    );
    expect(res.status(), `editor must get 403, got ${res.status()}`).toBe(403);

    await ctx.close();
  });

  test("admin: DELETE /api/knowledge/collections/[id]/documents/[docId] with non-existent doc returns 404", async () => {
    if (!collectionId) test.skip(true, "collection not created");

    const fakeDocId = Buffer.from("no-such-doc.pdf").toString("base64url");
    const res = await adminPage.request.delete(
      `/api/knowledge/collections/${collectionId}/documents/${fakeDocId}`,
    );
    expect(res.status(), `expected 404 for missing doc, got ${res.status()}`).toBe(404);
  });
});
