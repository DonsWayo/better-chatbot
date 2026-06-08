import { test, expect } from "@playwright/test";
import { TEST_USERS } from "../constants/test-users";

const PROMPTS_URL = "/api/prompts";

// Helper: attempt a best-effort DELETE of a created prompt.
// The prompts route exposes DELETE at /api/prompts/:id, so we hit that path.
async function tryCleanup(
  page: import("@playwright/test").Page,
  id: string,
): Promise<void> {
  try {
    await page.request.delete(`${PROMPTS_URL}/${id}`);
  } catch {
    // Non-fatal: cleanup is best-effort
  }
}

test.describe("Prompt Library API", () => {
  test.describe("Any authenticated user — GET", () => {
    test.use({ storageState: TEST_USERS.regular.authFile });

    test("GET /api/prompts returns 200 with an array", async ({ page }) => {
      const response = await page.request.get(PROMPTS_URL);

      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(Array.isArray(body)).toBe(true);
    });
  });

  test.describe("Any authenticated user — POST private prompt", () => {
    test.use({ storageState: TEST_USERS.editor.authFile });

    test("POST a private prompt returns 201 with an id", async ({ page }) => {
      const title = `E2E Private Prompt ${Date.now()}`;
      const response = await page.request.post(PROMPTS_URL, {
        data: {
          title,
          content: "This is a private test prompt created by E2E.",
          visibility: "private",
        },
      });

      expect(response.status()).toBe(201);
      const body = await response.json();
      expect(body).toHaveProperty("id");
      expect(body.title).toBe(title);
      expect(body.visibility).toBe("private");

      await tryCleanup(page, body.id);
    });

    test("Created private prompt appears in the creator's GET list", async ({
      page,
    }) => {
      const title = `E2E Visibility Check ${Date.now()}`;
      const created = await page.request.post(PROMPTS_URL, {
        data: {
          title,
          content: "Checking that this shows up in my own list.",
          visibility: "private",
        },
      });
      expect(created.status()).toBe(201);
      const { id } = await created.json();

      // Fetch the list as the same user
      const list = await page.request.get(PROMPTS_URL);
      expect(list.status()).toBe(200);
      const prompts = await list.json();

      const found = prompts.find(
        (p: { id: string }) => p.id === id,
      );
      expect(found).toBeDefined();

      await tryCleanup(page, id);
    });
  });

  test.describe("Any authenticated user — POST validation errors", () => {
    test.use({ storageState: TEST_USERS.regular.authFile });

    test("POST without title returns 400", async ({ page }) => {
      const response = await page.request.post(PROMPTS_URL, {
        data: {
          content: "Content without a title.",
          visibility: "private",
        },
      });

      expect(response.status()).toBe(400);
    });

    test("POST without content returns 400", async ({ page }) => {
      const response = await page.request.post(PROMPTS_URL, {
        data: {
          title: "Title without content",
          visibility: "private",
        },
      });

      expect(response.status()).toBe(400);
    });
  });

  test.describe("Unauthenticated — 401", () => {
    test("GET /api/prompts without a session returns 401", async ({
      browser,
    }) => {
      const context = await browser.newContext(); // no storageState
      const page = await context.newPage();

      const response = await page.request.get(PROMPTS_URL);
      expect(response.status()).toBe(401);

      await context.close();
    });
  });

  test.describe("Admin — org-visibility prompts", () => {
    test("Admin can create an org-visibility prompt and it returns 201", async ({
      browser,
    }) => {
      const adminContext = await browser.newContext({
        storageState: TEST_USERS.admin.authFile,
      });
      const adminPage = await adminContext.newPage();

      const title = `E2E Org Prompt ${Date.now()}`;
      const created = await adminPage.request.post(PROMPTS_URL, {
        data: {
          title,
          content: "Organisation-wide prompt visible to all users.",
          visibility: "org",
        },
      });

      expect(created.status()).toBe(201);
      const body = await created.json();
      expect(body).toHaveProperty("id");
      expect(body.visibility).toBe("org");

      // Cleanup via admin context
      await tryCleanup(adminPage, body.id);
      await adminContext.close();
    });

    test("Org-visibility prompt appears in a regular user's GET list", async ({
      browser,
    }) => {
      // Create the prompt as admin
      const adminContext = await browser.newContext({
        storageState: TEST_USERS.admin.authFile,
      });
      const adminPage = await adminContext.newPage();

      const title = `E2E Org Shared ${Date.now()}`;
      const created = await adminPage.request.post(PROMPTS_URL, {
        data: {
          title,
          content: "This should appear for every authenticated user.",
          visibility: "org",
        },
      });
      expect(created.status()).toBe(201);
      const { id } = await created.json();

      // Verify it's visible to a regular user
      const regularContext = await browser.newContext({
        storageState: TEST_USERS.regular.authFile,
      });
      const regularPage = await regularContext.newPage();

      const list = await regularPage.request.get(PROMPTS_URL);
      expect(list.status()).toBe(200);
      const prompts = await list.json();

      const found = prompts.find(
        (p: { id: string }) => p.id === id,
      );
      expect(found).toBeDefined();
      expect(found.visibility).toBe("org");

      // Cleanup
      await tryCleanup(adminPage, id);
      await adminContext.close();
      await regularContext.close();
    });
  });
});
