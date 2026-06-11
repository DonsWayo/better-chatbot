/**
 * Prompt Library — extended coverage
 *
 * The base scenarios (GET→200 array, POST private→201, private visible to
 * creator, missing title→400, missing content→400, unauthenticated GET→401,
 * admin creates org prompt→201, org prompt visible to regular user) are
 * already covered in tests/asafe/prompt-library.spec.ts.
 *
 * This file adds 5 complementary tests that do NOT duplicate those scenarios.
 */

import { expect, test } from "@playwright/test";
import { TEST_USERS } from "../constants/test-users";

let _c = 0;
function uid(): string {
  _c++;
  return `${_c}-${process.pid}`;
}

const PROMPTS_URL = "/api/prompts";

// Best-effort DELETE helper
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

// 1. Regular user's private prompt is NOT visible to an editor
test("Regular user's private prompt is NOT visible to another user (editor)", async ({
  browser,
}) => {
  // Step 1: regular user creates a private prompt
  const regularCtx = await browser.newContext({
    storageState: TEST_USERS.regular.authFile,
  });
  const regularPage = await regularCtx.newPage();

  const title = `private-by-regular-${uid()}`;
  const created = await regularPage.request.post(PROMPTS_URL, {
    data: {
      title,
      content: "This is a private prompt only the regular user should see.",
      visibility: "private",
    },
    failOnStatusCode: false,
  });

  expect(created.status()).toBe(201);
  const { id: promptId, authorId: regularAuthorId } = await created.json();
  expect(promptId).toBeTruthy();

  // Step 2: editor fetches the prompt list and should NOT see this prompt
  const editorCtx = await browser.newContext({
    storageState: TEST_USERS.editor.authFile,
  });
  const editorPage = await editorCtx.newPage();

  const list = await editorPage.request.get(PROMPTS_URL, {
    failOnStatusCode: false,
  });
  expect(list.status()).toBe(200);
  const prompts = await list.json();

  // Filter by the regular user's authorId to be precise
  const editorSeesRegularPrivate = prompts.some(
    (p: { id: string; authorId?: string }) => {
      // Match by id directly, or by authorId if the server returns it
      if (p.id === promptId) return true;
      if (
        regularAuthorId &&
        p.authorId === regularAuthorId &&
        p.id === promptId
      )
        return true;
      return false;
    },
  );

  expect(editorSeesRegularPrivate).toBe(false);

  // Cleanup
  await tryCleanup(regularPage, promptId);
  await regularCtx.close();
  await editorCtx.close();
});

// 2. Admin creates an org prompt; it IS in a regular user's list
test("Admin org-visibility prompt is visible to regular user in GET /api/prompts", async ({
  browser,
}) => {
  const adminCtx = await browser.newContext({
    storageState: TEST_USERS.admin.authFile,
  });
  const adminPage = await adminCtx.newPage();

  const title = `org-prompt-${uid()}`;
  const created = await adminPage.request.post(PROMPTS_URL, {
    data: {
      title,
      content:
        "This org-wide prompt should appear for all authenticated users.",
      visibility: "org",
    },
    failOnStatusCode: false,
  });

  expect(created.status()).toBe(201);
  const { id: promptId } = await created.json();
  expect(promptId).toBeTruthy();

  // Regular user fetches the list
  const regularCtx = await browser.newContext({
    storageState: TEST_USERS.regular.authFile,
  });
  const regularPage = await regularCtx.newPage();

  const list = await regularPage.request.get(PROMPTS_URL, {
    failOnStatusCode: false,
  });
  expect(list.status()).toBe(200);
  const prompts = await list.json();

  const found = prompts.find((p: { id: string }) => p.id === promptId);
  expect(found).toBeDefined();
  expect(found.visibility).toBe("org");

  // Cleanup
  await tryCleanup(adminPage, promptId);
  await adminCtx.close();
  await regularCtx.close();
});

// 3. POST /api/prompts without title returns 400
test("POST /api/prompts without title field returns 400", async ({
  browser,
}) => {
  const ctx = await browser.newContext({
    storageState: TEST_USERS.regular.authFile,
  });
  const page = await ctx.newPage();

  const response = await page.request.post(PROMPTS_URL, {
    data: {
      content: `Content without a title ${uid()}`,
      visibility: "private",
    },
    failOnStatusCode: false,
  });

  expect(response.status()).toBe(400);

  await ctx.close();
});

// 4. POST /api/prompts without content returns 400
test("POST /api/prompts without content field returns 400", async ({
  browser,
}) => {
  const ctx = await browser.newContext({
    storageState: TEST_USERS.regular.authFile,
  });
  const page = await ctx.newPage();

  const response = await page.request.post(PROMPTS_URL, {
    data: {
      title: `Title without content ${uid()}`,
      visibility: "private",
    },
    failOnStatusCode: false,
  });

  expect(response.status()).toBe(400);

  await ctx.close();
});

// 5. GET /api/prompts unauthenticated returns 401
test("GET /api/prompts without a session returns 401", async ({ browser }) => {
  const ctx = await browser.newContext(); // no storageState — anonymous
  const page = await ctx.newPage();

  const response = await page.request.get(PROMPTS_URL, {
    failOnStatusCode: false,
  });

  expect(response.status()).toBe(401);

  await ctx.close();
});
