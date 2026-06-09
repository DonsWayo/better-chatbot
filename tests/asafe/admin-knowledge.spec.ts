/**
 * E2E tests for Knowledge Collections API — Admin CRUD and role-based
 * permission enforcement.
 *
 * Tests run serially within the describe block so they can share a single
 * admin context and the created collectionId between steps.
 *
 * The afterAll hook deletes the test collection to keep the database clean.
 */

import { test, expect, Browser, BrowserContext, Page } from "@playwright/test";
import { TEST_USERS } from "../constants/test-users";

let _c = 0;
function uid(): string { _c++; return `${_c}-${process.pid}`; }

// ---------------------------------------------------------------------------
// Shared state within the serial describe block
// ---------------------------------------------------------------------------

let adminContext: BrowserContext;
let adminPage: Page;
let collectionId: string | undefined;

test.describe.serial("Knowledge Collections — Admin CRUD + permissions", () => {
  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    adminContext = await browser.newContext({
      storageState: TEST_USERS.admin.authFile,
    });
    adminPage = await adminContext.newPage();
  });

  test.afterAll(async () => {
    // Clean up: delete the collection created during the test run.
    if (collectionId) {
      try {
        await adminPage.request.delete(
          `/api/knowledge/collections/${collectionId}`,
        );
      } catch {
        // Best-effort cleanup — do not fail the suite.
      }
    }
    await adminContext.close();
  });

  // -------------------------------------------------------------------------
  // Test 1: Admin can create a collection
  // -------------------------------------------------------------------------

  test("admin: POST /api/knowledge/collections creates a collection (200/201)", async () => {
    const response = await adminPage.request.post(
      "/api/knowledge/collections",
      {
        headers: { "Content-Type": "application/json" },
        data: { name: `e2e-col-${uid()}` },
      },
    );

    const status = response.status();
    expect(
      [200, 201],
      `Admin collection creation must return 200 or 201, got ${status}`,
    ).toContain(status);

    const body = await response.json();
    // Capture the id for subsequent tests and cleanup.
    collectionId = body?.collection?.id as string | undefined;

    expect(
      collectionId,
      "Response body must include collection.id",
    ).toBeTruthy();
  });

  // -------------------------------------------------------------------------
  // Test 2: Editor can list collections
  // -------------------------------------------------------------------------

  test("editor: GET /api/knowledge/collections returns 200 with array", async ({
    browser,
  }) => {
    const ctx = await browser.newContext({
      storageState: TEST_USERS.editor.authFile,
    });
    const page = await ctx.newPage();

    const response = await page.request.get("/api/knowledge/collections");

    expect(
      response.status(),
      `Editor must be able to list collections, got ${response.status()}`,
    ).toBe(200);

    const body = await response.json();
    expect(
      Array.isArray(body?.collections),
      "Response body must include a collections array",
    ).toBe(true);

    await ctx.close();
  });

  // -------------------------------------------------------------------------
  // Test 3: Regular user can list collections
  // -------------------------------------------------------------------------

  test("regular user: GET /api/knowledge/collections returns 200", async ({
    browser,
  }) => {
    const ctx = await browser.newContext({
      storageState: TEST_USERS.regular.authFile,
    });
    const page = await ctx.newPage();

    const response = await page.request.get("/api/knowledge/collections");

    expect(
      response.status(),
      `Regular user must be able to list collections, got ${response.status()}`,
    ).toBe(200);

    await ctx.close();
  });

  // -------------------------------------------------------------------------
  // Test 4: Editor cannot create a collection (403)
  // -------------------------------------------------------------------------

  test("editor: POST /api/knowledge/collections is forbidden (403)", async ({
    browser,
  }) => {
    const ctx = await browser.newContext({
      storageState: TEST_USERS.editor.authFile,
    });
    const page = await ctx.newPage();

    const response = await page.request.post(
      "/api/knowledge/collections",
      {
        headers: { "Content-Type": "application/json" },
        data: { name: `e2e-col-editor-${uid()}` },
      },
    );

    expect(
      response.status(),
      `Editor must not be able to create a collection, got ${response.status()}`,
    ).toBe(403);

    await ctx.close();
  });

  // -------------------------------------------------------------------------
  // Test 5: Regular user cannot create a collection (403)
  // -------------------------------------------------------------------------

  test("regular user: POST /api/knowledge/collections is forbidden (403)", async ({
    browser,
  }) => {
    const ctx = await browser.newContext({
      storageState: TEST_USERS.regular.authFile,
    });
    const page = await ctx.newPage();

    const response = await page.request.post(
      "/api/knowledge/collections",
      {
        headers: { "Content-Type": "application/json" },
        data: { name: `e2e-col-regular-${uid()}` },
      },
    );

    expect(
      response.status(),
      `Regular user must not be able to create a collection, got ${response.status()}`,
    ).toBe(403);

    await ctx.close();
  });

  // -------------------------------------------------------------------------
  // Test 6: Anonymous cannot list collections (401)
  // -------------------------------------------------------------------------

  test("anonymous: GET /api/knowledge/collections returns 401", async ({
    browser,
  }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();

    const response = await page.request.get("/api/knowledge/collections");

    expect(
      response.status(),
      `Anonymous must not be able to list collections, got ${response.status()}`,
    ).toBe(401);

    await ctx.close();
  });

  // -------------------------------------------------------------------------
  // Test 7: Admin can navigate to /admin/knowledge without being redirected
  // -------------------------------------------------------------------------

  test("admin: /admin/knowledge loads without redirect to login", async () => {
    await adminPage.goto("/admin/knowledge", { waitUntil: "networkidle" });

    const url = adminPage.url();
    expect(
      url.includes("knowledge") || url.includes("admin"),
      `Admin should stay on the knowledge/admin page but was redirected to ${url}`,
    ).toBe(true);
  });
});
