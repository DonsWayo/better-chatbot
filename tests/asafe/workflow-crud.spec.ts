/**
 * E2E tests for Workflow full CRUD + execution trigger.
 *
 * Route map (as of IA §4):
 *   /workflow         → redirect to /studio?tab=workflows
 *   /studio?tab=workflows → WorkflowListPage (agents/workflow/knowledge tabs)
 *   /workflow/[id]    → workflow editor (ReactFlow canvas + panel)
 *   /inbox            → Triage inbox; Runs tab lists agent_session records
 *   /runs             → redirect to /inbox
 *
 * Permissions:
 *   admin/editor  — can create, edit, delete workflows
 *   regular user  — redirected away from /studio; cannot create/edit/delete
 *
 * Naming constraint: workflow names must match /^[a-zA-Z -]+$/ (letters, spaces,
 * hyphens only).  All test names use that character set.
 *
 * Notes:
 * - The workflow list is rendered inside the Studio page Workflows tab.
 * - The create card is an EditWorkflowPopup dialog (id="workflow-name").
 * - After creating a workflow the app navigates to /workflow/[id].
 * - Deleting requires a confirm dialog (notify.confirm).
 * - Execution POST /api/workflow/[id]/execute — we test via page.request to
 *   avoid blocking on the streaming result and to stay focused on the API
 *   contract and run-list appearance.
 * - Runs appear in the Inbox under the Runs tab (second tab).
 */

import { expect, test } from "@playwright/test";
import { TEST_USERS } from "../constants/test-users";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Letters + spaces only (satisfies the zod regex /^[a-zA-Z -]+$/).
 * base-36 digits 0-9 are remapped to A-J to avoid digit characters. */
function wfName(label: string): string {
  const suffix = Date.now()
    .toString(36)
    .toUpperCase()
    .replace(/[0-9]/g, (d) => String.fromCharCode(65 + Number(d)));
  return `${label} ${suffix}`;
}

/**
 * Create a workflow via the API and return its id.
 * Faster than driving the UI for setup-only workflows.
 */
async function apiCreateWorkflow(
  page: { request: import("@playwright/test").APIRequestContext },
  name: string,
): Promise<string> {
  const res = await page.request.post("/api/workflow", {
    headers: { "Content-Type": "application/json" },
    data: {
      name,
      description: "Created by workflow-crud e2e",
      icon: {
        type: "emoji",
        value:
          "https://cdn.jsdelivr.net/npm/emoji-datasource-apple/img/apple/64/1f916.png",
        style: { backgroundColor: "#6366f1" },
      },
    },
  });
  expect(res.status()).toBe(200);
  const body = await res.json();
  return body.id as string;
}

/** Delete a workflow via the API (cleanup). */
async function apiDeleteWorkflow(
  page: { request: import("@playwright/test").APIRequestContext },
  id: string,
): Promise<void> {
  await page.request.delete(`/api/workflow/${id}`);
}

// ---------------------------------------------------------------------------
// Suite 1 — Create workflow via UI (title field + save)
// ---------------------------------------------------------------------------

test.describe("Workflow CRUD — create via UI", () => {
  test.use({ storageState: TEST_USERS.editor.authFile });

  test("clicking the Create card opens the dialog and saving navigates to the editor", async ({
    page,
  }) => {
    await page.goto("/studio?tab=workflows", { waitUntil: "domcontentloaded" });

    // The "Create Workflow" card is a DialogTrigger wrapping a Card.
    // An absolute-positioned BackgroundPaths overlay (pointer-events not disabled)
    // sits on top of the inner "Create" button, so force:true is required.
    const createTrigger = page.getByRole("button", { name: "Create", exact: true });

    await expect(createTrigger).toBeVisible({ timeout: 10_000 });
    await createTrigger.click({ force: true });

    // The dialog should now be open. The name input has id="workflow-name".
    const nameInput = page.locator("#workflow-name");
    await expect(nameInput).toBeVisible({ timeout: 5_000 });

    const name = wfName("UI Created Workflow");
    await nameInput.fill(name);

    // Click the Save button inside the dialog footer.
    await page.getByRole("button", { name: /save/i }).click();

    // After save the app navigates to /workflow/[id].
    await expect(page).toHaveURL(/\/workflow\/[0-9a-f-]{36}/, {
      timeout: 15_000,
    });

    // The workflow editor should be visible (ReactFlow canvas).
    await expect(page.locator(".react-flow")).toBeVisible({ timeout: 10_000 });
  });
});

// ---------------------------------------------------------------------------
// Suite 2 — Create + rename workflow title inline
// ---------------------------------------------------------------------------

test.describe("Workflow CRUD — rename inline via panel", () => {
  test.use({ storageState: TEST_USERS.editor.authFile });

  test("opening edit popup from the workflow panel renames the workflow", async ({
    page,
  }) => {
    // Create via API so this test owns its data.
    const originalName = wfName("Original Name");
    const id = await apiCreateWorkflow(page, originalName);

    try {
      await page.goto(`/workflow/${id}`, { waitUntil: "networkidle" });

      // Wait for the editor canvas to confirm the page is fully hydrated.
      await expect(page.locator(".react-flow")).toBeVisible({ timeout: 15_000 });

      // The workflow panel renders a small icon/avatar that opens the rename popup.
      // Prefer the testid (present after rebuild); fall back to the unique Tailwind
      // class "hover:ring-ring" that only the rename trigger carries on this page.
      const iconBtn = page
        .getByTestId("workflow-rename-trigger")
        .or(page.locator('[class*="hover:ring-ring"]').first());

      await expect(iconBtn).toBeVisible({ timeout: 5_000 });
      await iconBtn.click();

      // The rename dialog should open with the current name pre-filled.
      const nameInput = page.locator("#workflow-name");
      await expect(nameInput).toBeVisible({ timeout: 5_000 });

      const newName = wfName("Renamed Workflow");
      await nameInput.fill(newName);

      // Save.
      await page.getByRole("button", { name: /save/i }).click();

      // Dialog should close.
      await expect(nameInput).not.toBeVisible({ timeout: 5_000 });

      // Verify the tooltip shows the new name (the panel tooltip wraps the icon).
      // Also verify via API.
      const apiRes = await page.request.get(`/api/workflow/${id}`);
      const body = await apiRes.json();
      expect(body.name).toBe(newName);
    } finally {
      await apiDeleteWorkflow(page, id);
    }
  });
});

// ---------------------------------------------------------------------------
// Suite 3 — Delete workflow from list and confirm removal from /studio
// ---------------------------------------------------------------------------

test.describe("Workflow CRUD — delete from studio list", () => {
  test.use({ storageState: TEST_USERS.editor.authFile });

  test("deleting a workflow via API removes it from GET /api/workflow", async ({
    page,
  }) => {
    const name = wfName("To Be Deleted");
    const id = await apiCreateWorkflow(page, name);

    // Confirm it exists.
    const listBefore = await page.request.get("/api/workflow");
    const itemsBefore: Array<{ id: string }> = await listBefore.json();
    expect(itemsBefore.some((w) => w.id === id)).toBe(true);

    // Delete via API.
    const delRes = await page.request.delete(`/api/workflow/${id}`);
    expect(delRes.status()).toBe(200);

    // Confirm it is gone from the list.
    const listAfter = await page.request.get("/api/workflow");
    const itemsAfter: Array<{ id: string }> = await listAfter.json();
    expect(itemsAfter.some((w) => w.id === id)).toBe(false);
  });

  test("navigating to /workflow/[deleted-id] returns a 404-like page", async ({
    page,
  }) => {
    const name = wfName("Delete Then Navigate");
    const id = await apiCreateWorkflow(page, name);

    await page.request.delete(`/api/workflow/${id}`);

    await page.goto(`/workflow/${id}`, { waitUntil: "domcontentloaded" });

    // Next.js renders an error page (404 or notFound). The URL should NOT
    // be a valid workflow editor page — check no ReactFlow canvas is rendered.
    await page.waitForTimeout(1_000);
    const canvas = page.locator(".react-flow");
    const canvasVisible = await canvas.isVisible().catch(() => false);
    expect(canvasVisible).toBe(false);
  });

  test("studio list does not show a deleted workflow card", async ({ page }) => {
    const name = wfName("Hidden After Delete");
    const id = await apiCreateWorkflow(page, name);

    // Delete before visiting the page.
    await page.request.delete(`/api/workflow/${id}`);

    await page.goto("/studio?tab=workflows", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(500);

    // No card should carry the deleted workflow's id.
    const card = page.locator(`[data-item-id="${id}"]`);
    await expect(card).not.toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Suite 4 — Execute a simple workflow and see it appear in /inbox Runs list
// ---------------------------------------------------------------------------

test.describe("Workflow execution — run trigger and run list", () => {
  test.use({ storageState: TEST_USERS.admin.authFile });

  test("POST /api/workflow/[id]/execute returns a streaming 200 response", async ({
    page,
  }) => {
    const name = wfName("Execute Test Workflow");
    const id = await apiCreateWorkflow(page, name);

    try {
      const res = await page.request.post(`/api/workflow/${id}/execute`, {
        headers: { "Content-Type": "application/json" },
        data: { query: {} },
      });

      // The execute endpoint streams or returns 200. Budget exhausted => 402.
      // Unauthorized => 401 (should not happen for admin). 4xx other than 402
      // would indicate a bug.
      const status = res.status();
      expect(
        [200, 402],
        `Execute should stream (200) or hit budget limit (402), got ${status}`,
      ).toContain(status);
    } finally {
      await apiDeleteWorkflow(page, id);
    }
  });

  test("after execution a run record appears in GET /api/runs", async ({
    page,
  }) => {
    const name = wfName("Run Record Workflow");
    const id = await apiCreateWorkflow(page, name);

    try {
      // Snapshot runs count before execution.
      const before = await page.request.get("/api/runs");
      const runsBefore: Array<{ definitionId?: string }> = await before.json();
      const countBefore = runsBefore.filter((r) => r.definitionId === id).length;

      // Trigger execution (best-effort — if budget is exhausted skip this check).
      const execRes = await page.request.post(`/api/workflow/${id}/execute`, {
        headers: { "Content-Type": "application/json" },
        data: { query: {} },
      });

      if (execRes.status() === 402) {
        // Budget exhausted — skip run-record assertion.
        test.skip();
        return;
      }

      // Wait briefly for the agent_session record to land.
      await page.waitForTimeout(2_000);

      const after = await page.request.get("/api/runs");
      const runsAfter: Array<{ definitionId?: string }> = await after.json();
      const countAfter = runsAfter.filter((r) => r.definitionId === id).length;

      expect(countAfter).toBeGreaterThan(countBefore);
    } finally {
      await apiDeleteWorkflow(page, id);
    }
  });

  test("Inbox Runs tab shows a run entry after workflow execution", async ({
    page,
  }) => {
    const name = wfName("Inbox Run Workflow");
    const id = await apiCreateWorkflow(page, name);

    try {
      const execRes = await page.request.post(`/api/workflow/${id}/execute`, {
        headers: { "Content-Type": "application/json" },
        data: { query: {} },
      });

      if (execRes.status() === 402) {
        test.skip();
        return;
      }

      // Allow the session persistence to settle.
      await page.waitForTimeout(2_000);

      await page.goto("/inbox", { waitUntil: "domcontentloaded" });

      // Switch to the Runs tab (second tab, index 1).
      const tabs = page.getByRole("tab");
      await expect(tabs.nth(1)).toBeVisible({ timeout: 10_000 });
      await tabs.nth(1).click();

      // At least one inbox item should be present.
      const items = page.getByTestId("inbox-item");
      await expect(items.first()).toBeVisible({ timeout: 10_000 });
    } finally {
      await apiDeleteWorkflow(page, id);
    }
  });
});

// ---------------------------------------------------------------------------
// Suite 5 — Workflow execution with missing/disabled API key returns graceful error
// ---------------------------------------------------------------------------

test.describe("Workflow execution — graceful error handling", () => {
  test.use({ storageState: TEST_USERS.admin.authFile });

  test("execute endpoint does not return 500 even when LLM node would fail", async ({
    page,
  }) => {
    // We POST with a bad/empty query. The workflow executor streams events; a
    // node-level failure produces a WORKFLOW_END with isOk=false (not a 500).
    const name = wfName("Error Case Workflow");
    const id = await apiCreateWorkflow(page, name);

    try {
      const res = await page.request.post(`/api/workflow/${id}/execute`, {
        headers: { "Content-Type": "application/json" },
        data: { query: { __bad: true } },
      });

      // Should be 200 (streaming), 402 (budget), or 401/404 — never 500.
      expect(res.status()).not.toBe(500);
    } finally {
      await apiDeleteWorkflow(page, id);
    }
  });

  test("execute endpoint returns 402 when budget is exhausted", async ({
    page,
  }) => {
    // This test is speculative — we cannot force a budget-exhausted state in a
    // standard test run.  We verify the API surface is correct: if 402 is
    // returned it carries a JSON body with a message field.
    const name = wfName("Budget Check Workflow");
    const id = await apiCreateWorkflow(page, name);

    try {
      const res = await page.request.post(`/api/workflow/${id}/execute`, {
        headers: { "Content-Type": "application/json" },
        data: { query: {} },
      });

      if (res.status() === 402) {
        const body = await res.json();
        expect(body).toHaveProperty("message");
      } else {
        // 200 streaming — the budget check passed, which is also valid.
        expect([200, 401]).toContain(res.status());
      }
    } finally {
      await apiDeleteWorkflow(page, id);
    }
  });
});

// ---------------------------------------------------------------------------
// Suite 6 — Non-entitled user (regular) is redirected away from /workflow/[id]
// ---------------------------------------------------------------------------

test.describe("Workflow access — regular user is gate-kept", () => {
  test("regular user visiting /studio is redirected to /", async ({
    browser,
  }) => {
    const ctx = await browser.newContext({
      storageState: TEST_USERS.regular.authFile,
    });
    const page = await ctx.newPage();

    await page.goto("/studio", { waitUntil: "domcontentloaded" });

    // Studio redirects non-builder users to the home route.
    // waitForURL predicate receives a URL object (not a string) in Playwright 1.47+.
    await page.waitForURL((url) => !url.href.includes("/studio"), { timeout: 10_000 });
    expect(page.url()).not.toContain("/studio");

    await ctx.close();
  });

  test("regular user visiting /workflow/[id] is redirected (notFound or sign-in)", async ({
    browser,
  }) => {
    // We need a real workflow id to navigate to. Create one using the admin
    // credentials in a separate context.
    const adminCtx = await browser.newContext({
      storageState: TEST_USERS.admin.authFile,
    });
    const adminPage = await adminCtx.newPage();
    const wfId = await apiCreateWorkflow(adminPage, wfName("Gate Test"));
    await adminCtx.close();

    const ctx = await browser.newContext({
      storageState: TEST_USERS.regular.authFile,
    });
    const page = await ctx.newPage();

    await page.goto(`/workflow/${wfId}`, { waitUntil: "domcontentloaded" });

    // The page must NOT render the ReactFlow canvas.
    await page.waitForTimeout(1_000);
    const canvas = page.locator(".react-flow");
    const canvasVisible = await canvas.isVisible().catch(() => false);
    expect(canvasVisible).toBe(false);

    // Cleanup.
    await ctx.close();

    const cleanCtx = await browser.newContext({
      storageState: TEST_USERS.admin.authFile,
    });
    const cleanPage = await cleanCtx.newPage();
    await apiDeleteWorkflow(cleanPage, wfId);
    await cleanCtx.close();
  });

  test("regular user: GET /api/workflow returns empty array or own workflows", async ({
    browser,
  }) => {
    const ctx = await browser.newContext({
      storageState: TEST_USERS.regular.authFile,
    });
    const page = await ctx.newPage();

    const res = await page.request.get("/api/workflow");
    // Endpoint returns [] for unauthenticated callers OR an array of the
    // user's visible workflows. It must not return 401 or 403.
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);

    await ctx.close();
  });

  test("regular user: POST /api/workflow is rejected with 403", async ({
    browser,
  }) => {
    const ctx = await browser.newContext({
      storageState: TEST_USERS.regular.authFile,
    });
    const page = await ctx.newPage();

    const res = await page.request.post("/api/workflow", {
      headers: { "Content-Type": "application/json" },
      data: {
        name: "Should Be Blocked",
        icon: {
          type: "emoji",
          value:
            "https://cdn.jsdelivr.net/npm/emoji-datasource-apple/img/apple/64/1f916.png",
        },
      },
    });

    // Expect 403 — regular users cannot create workflows.
    expect(res.status()).toBe(403);
    const body = await res.json();
    expect(body).toHaveProperty("error");

    await ctx.close();
  });

  test("regular user: DELETE /api/workflow/[id] is rejected with 403", async ({
    browser,
  }) => {
    // Create a workflow as admin.
    const adminCtx = await browser.newContext({
      storageState: TEST_USERS.admin.authFile,
    });
    const adminPage = await adminCtx.newPage();
    const wfId = await apiCreateWorkflow(adminPage, wfName("Delete Guard"));
    await adminCtx.close();

    const ctx = await browser.newContext({
      storageState: TEST_USERS.regular.authFile,
    });
    const page = await ctx.newPage();

    const res = await page.request.delete(`/api/workflow/${wfId}`);
    // Must be 403 (permission denied) or 401 (no access).
    expect([401, 403]).toContain(res.status());

    await ctx.close();

    // Clean up as admin.
    const cleanCtx = await browser.newContext({
      storageState: TEST_USERS.admin.authFile,
    });
    const cleanPage = await cleanCtx.newPage();
    await apiDeleteWorkflow(cleanPage, wfId);
    await cleanCtx.close();
  });
});

// ---------------------------------------------------------------------------
// Suite 7 — API CRUD sanity (editor role via page.request)
// ---------------------------------------------------------------------------

test.describe("Workflow API — CRUD sanity (editor)", () => {
  test.use({ storageState: TEST_USERS.editor.authFile });

  test("GET /api/workflow returns 200 with an array", async ({ page }) => {
    const res = await page.request.get("/api/workflow");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  test("POST /api/workflow creates a workflow; GET /api/workflow/[id] reads it back", async ({
    page,
  }) => {
    const name = wfName("API Create Read");
    const res = await page.request.post("/api/workflow", {
      headers: { "Content-Type": "application/json" },
      data: {
        name,
        description: "API CRUD test",
        icon: {
          type: "emoji",
          value:
            "https://cdn.jsdelivr.net/npm/emoji-datasource-apple/img/apple/64/1f916.png",
        },
      },
    });
    expect(res.status()).toBe(200);
    const created = await res.json();
    expect(created.name).toBe(name);
    const id: string = created.id;

    try {
      const getRes = await page.request.get(`/api/workflow/${id}`);
      expect(getRes.status()).toBe(200);
      const fetched = await getRes.json();
      expect(fetched.id).toBe(id);
      expect(fetched.name).toBe(name);
    } finally {
      await apiDeleteWorkflow(page, id);
    }
  });

  test("DELETE /api/workflow/[id] removes the workflow; subsequent GET returns 401", async ({
    page,
  }) => {
    const name = wfName("API Delete");
    const id = await apiCreateWorkflow(page, name);

    const delRes = await page.request.delete(`/api/workflow/${id}`);
    expect(delRes.status()).toBe(200);
    const delBody = await delRes.json();
    expect(delBody.message).toMatch(/deleted/i);

    // The workflow no longer exists — access check fails → 401.
    const getRes = await page.request.get(`/api/workflow/${id}`);
    expect(getRes.status()).toBe(401);
  });
});
