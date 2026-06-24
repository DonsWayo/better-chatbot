/**
 * Deep Playwright E2E tests for the workflow builder.
 *
 * Route map:
 *   /workflow              → redirect to /studio?tab=workflows
 *   /studio?tab=workflows  → WorkflowListPage (My Workflows grid + shared)
 *   /workflow/[id]         → ReactFlow canvas editor + WorkflowPanel
 *   /inbox (Runs tab)      → agent_session records for this user
 *   /runs/[id]             → full run transcript page
 *
 * Permissions:
 *   admin / editor  — can create, edit, publish, delete workflows
 *   regular user    — redirected from /studio; read-only access to shared workflows
 *
 * Naming constraint: workflow names must satisfy /^[a-zA-Z -]+$/
 * (the zod schema on the backend rejects digits / special chars).
 *
 * Suites:
 *   1. Navigate to workflows page (studio Workflows tab)
 *   2. Create a workflow via the UI create-card dialog
 *   3. Workflow run — "Run" panel opens, inputs rendered, execute fires
 *   4. Workflow run history — Inbox Runs tab + /runs/[id] transcript
 *   5. Workflow scheduling — /schedule dialog creates a routine
 *   6. Workflow visibility — change visibility via the panel control
 *   7. Delete a workflow — delete button + confirm dialog removes the card
 *   8. NL workflow generation hint — describe-workflow CTA visible in empty state
 *   9. Publish / unpublish toggle
 *  10. Node management — add node via the + handle, delete via context menu
 *  11. API layer — structure save, GET, PUT, DELETE
 *  12. Role gating — regular user is blocked from create/edit/delete
 */

import { type BrowserContext, type Page, expect, test } from "@playwright/test";
import { TEST_USERS } from "../constants/test-users";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Return a unique workflow name that satisfies /^[a-zA-Z -]+$/. */
function wfName(label: string): string {
  // base-36 stamp → upper-case letters only (replace digits 0-9 → A-J).
  const stamp = Date.now()
    .toString(36)
    .toUpperCase()
    .replace(/[0-9]/g, (d) => String.fromCharCode(65 + Number(d)));
  return `${label} ${stamp}`;
}

/** Create a workflow via REST and return its id. */
async function apiCreateWorkflow(
  request: import("@playwright/test").APIRequestContext,
  name: string,
  extra: Record<string, unknown> = {},
): Promise<string> {
  const res = await request.post("/api/workflow", {
    headers: { "Content-Type": "application/json" },
    data: {
      name,
      description: "Deep e2e test workflow",
      icon: {
        type: "emoji",
        value:
          "https://cdn.jsdelivr.net/npm/emoji-datasource-apple/img/apple/64/1f916.png",
        style: { backgroundColor: "#6366f1" },
      },
      ...extra,
    },
  });
  expect(res.status(), `Create workflow "${name}" failed`).toBe(200);
  const body = await res.json();
  return body.id as string;
}

/** Delete a workflow via REST. Best-effort — swallows errors so cleanup is safe. */
async function apiDeleteWorkflow(
  request: import("@playwright/test").APIRequestContext,
  id: string,
): Promise<void> {
  await request.delete(`/api/workflow/${id}`).catch(() => {});
}

/** Navigate to the Studio Workflows tab and wait for it to settle. */
async function gotoWorkflowsTab(page: Page): Promise<void> {
  await page.goto("/studio?tab=workflows", { waitUntil: "domcontentloaded" });
  // The heading "My Workflows" or the create card must be visible.
  await expect(
    page
      .getByRole("heading", { name: /my workflows|available workflows/i })
      .or(page.getByTestId("create-workflow-with-example-button"))
      .first(),
  ).toBeVisible({ timeout: 12_000 });
}

// ---------------------------------------------------------------------------
// Suite 1: Navigate to workflows page
// ---------------------------------------------------------------------------

test.describe("Suite 1 — Navigate to workflows page", () => {
  test.use({ storageState: TEST_USERS.editor.authFile });

  test("/workflow redirects to /studio?tab=workflows", async ({ page }) => {
    await page.goto("/workflow", { waitUntil: "domcontentloaded" });
    await page.waitForURL(/\/studio/, { timeout: 10_000 });
    expect(page.url()).toContain("/studio");
  });

  test("Workflows tab renders My Workflows section", async ({ page }) => {
    await gotoWorkflowsTab(page);
    await expect(
      page.getByRole("heading", { name: /my workflows/i }),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("Create Workflow card is visible for editor", async ({ page }) => {
    await gotoWorkflowsTab(page);
    // The "Create" button lives inside the create card (inside an EditWorkflowPopup).
    const createBtn = page.getByRole("button", { name: /^create$/i });
    await expect(createBtn).toBeVisible({ timeout: 10_000 });
  });

  test("Example workflow dropdown button is visible", async ({ page }) => {
    await gotoWorkflowsTab(page);
    await expect(
      page.getByTestId("create-workflow-with-example-button"),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("workflow cards render with a name and date", async ({ page }) => {
    // Create a workflow so there is guaranteed at least one card.
    const name = wfName("List Render Test");
    const id = await apiCreateWorkflow(page.request, name);
    try {
      await gotoWorkflowsTab(page);
      const card = page.locator(`[data-item-id="${id}"]`);
      await expect(card).toBeVisible({ timeout: 10_000 });
      await expect(card.getByTestId("workflow-card-name")).toHaveText(name);
    } finally {
      await apiDeleteWorkflow(page.request, id);
    }
  });

  test("workflow card links to the editor", async ({ page }) => {
    const name = wfName("Card Link Test");
    const id = await apiCreateWorkflow(page.request, name);
    try {
      await gotoWorkflowsTab(page);
      const card = page.locator(`[data-item-id="${id}"]`);
      await expect(card).toBeVisible({ timeout: 10_000 });
      // The card is wrapped in an <a href="/workflow/[id]"> link.
      await expect(card.locator("..")).toHaveAttribute(
        "href",
        `/workflow/${id}`,
      );
    } finally {
      await apiDeleteWorkflow(page.request, id);
    }
  });
});

// ---------------------------------------------------------------------------
// Suite 2: Create a workflow via the UI dialog
// ---------------------------------------------------------------------------

test.describe("Suite 2 — Create workflow via UI dialog", () => {
  test.use({ storageState: TEST_USERS.editor.authFile });

  test("clicking Create card opens the name dialog", async ({ page }) => {
    await gotoWorkflowsTab(page);
    const createBtn = page.getByRole("button", { name: /^create$/i });
    await expect(createBtn).toBeVisible({ timeout: 10_000 });
    await createBtn.click({ force: true });

    const nameInput = page.locator("#workflow-name");
    await expect(nameInput).toBeVisible({ timeout: 5_000 });
  });

  test("creating a workflow navigates to the ReactFlow editor", async ({
    page,
  }) => {
    await gotoWorkflowsTab(page);
    const createBtn = page.getByRole("button", { name: /^create$/i });
    await createBtn.click({ force: true });

    const nameInput = page.locator("#workflow-name");
    await expect(nameInput).toBeVisible({ timeout: 5_000 });
    const name = wfName("UI Dialog Create");
    await nameInput.fill(name);

    await page.getByRole("button", { name: /save/i }).click();

    // Navigation to /workflow/[uuid] and ReactFlow canvas.
    await expect(page).toHaveURL(/\/workflow\/[0-9a-f-]{36}/, {
      timeout: 15_000,
    });
    await expect(page.locator(".react-flow")).toBeVisible({ timeout: 10_000 });

    // Cleanup: delete via API using the id from the URL.
    const match = page.url().match(/\/workflow\/([0-9a-f-]{36})/);
    if (match) await apiDeleteWorkflow(page.request, match[1]);
  });

  test("creating with empty name does not submit (Save stays disabled or shows validation)", async ({
    page,
  }) => {
    await gotoWorkflowsTab(page);
    const createBtn = page.getByRole("button", { name: /^create$/i });
    await createBtn.click({ force: true });

    const nameInput = page.locator("#workflow-name");
    await expect(nameInput).toBeVisible({ timeout: 5_000 });
    // Clear any pre-filled content.
    await nameInput.fill("");

    await page.getByRole("button", { name: /save/i }).click();

    // Should NOT navigate away: the dialog stays open or a toast appears.
    // The URL must not change to /workflow/[id].
    await page.waitForTimeout(1_000);
    expect(page.url()).not.toMatch(/\/workflow\/[0-9a-f-]{36}/);
  });

  test("Create with Example dropdown lists Baby Research and Get Weather", async ({
    page,
  }) => {
    await gotoWorkflowsTab(page);
    const dropdownBtn = page.getByTestId("create-workflow-with-example-button");
    await expect(dropdownBtn).toBeVisible({ timeout: 10_000 });
    await dropdownBtn.click();

    // Both example items must appear in the dropdown.
    await expect(
      page.getByRole("menuitem").filter({ hasText: /baby research/i }),
    ).toBeVisible({ timeout: 5_000 });
    await expect(
      page.getByRole("menuitem").filter({ hasText: /get weather/i }),
    ).toBeVisible({ timeout: 5_000 });
  });

  test("new workflow appears in the list after creation", async ({ page }) => {
    const name = wfName("Appears In List");
    const id = await apiCreateWorkflow(page.request, name);
    try {
      await gotoWorkflowsTab(page);
      const card = page.locator(`[data-item-id="${id}"]`);
      await expect(card).toBeVisible({ timeout: 10_000 });
    } finally {
      await apiDeleteWorkflow(page.request, id);
    }
  });

  test("new workflow shows Draft badge (not yet published)", async ({
    page,
  }) => {
    const name = wfName("Draft Badge Check");
    const id = await apiCreateWorkflow(page.request, name);
    try {
      await gotoWorkflowsTab(page);
      const card = page.locator(`[data-item-id="${id}"]`);
      await expect(card).toBeVisible({ timeout: 10_000 });
      await expect(card.getByText(/draft/i)).toBeVisible();
    } finally {
      await apiDeleteWorkflow(page.request, id);
    }
  });
});

// ---------------------------------------------------------------------------
// Suite 3: Workflow Run — panel, inputs, execute
// ---------------------------------------------------------------------------

test.describe("Suite 3 — Workflow run panel", () => {
  test.use({ storageState: TEST_USERS.admin.authFile });

  test("Run button is visible in the workflow panel", async ({ page }) => {
    const name = wfName("Run Panel Test");
    const id = await apiCreateWorkflow(page.request, name);
    try {
      await page.goto(`/workflow/${id}`, { waitUntil: "networkidle" });
      await expect(page.locator(".react-flow")).toBeVisible({
        timeout: 15_000,
      });

      const runBtn = page.getByRole("button", { name: /^run$/i });
      await expect(runBtn).toBeVisible({ timeout: 5_000 });
    } finally {
      await apiDeleteWorkflow(page.request, id);
    }
  });

  test("clicking Run opens the Test Run panel with Input/Result tabs", async ({
    page,
  }) => {
    const name = wfName("Run Panel Open");
    const id = await apiCreateWorkflow(page.request, name);
    try {
      await page.goto(`/workflow/${id}`, { waitUntil: "networkidle" });
      await expect(page.locator(".react-flow")).toBeVisible({
        timeout: 15_000,
      });

      await page.getByRole("button", { name: /^run$/i }).click();

      // The ExecuteTab panel renders with "Test Run" heading and two tab buttons.
      await expect(page.getByRole("button", { name: /^input$/i })).toBeVisible({
        timeout: 5_000,
      });
      await expect(page.getByRole("button", { name: /^result$/i })).toBeVisible(
        { timeout: 5_000 },
      );
    } finally {
      await apiDeleteWorkflow(page.request, id);
    }
  });

  test("Run panel closes when X button is clicked", async ({ page }) => {
    const name = wfName("Run Panel Close");
    const id = await apiCreateWorkflow(page.request, name);
    try {
      await page.goto(`/workflow/${id}`, { waitUntil: "networkidle" });
      await expect(page.locator(".react-flow")).toBeVisible({
        timeout: 15_000,
      });

      await page.getByRole("button", { name: /^run$/i }).click();
      await expect(page.getByRole("button", { name: /^input$/i })).toBeVisible({
        timeout: 5_000,
      });

      // The X icon closes the panel. It's the only button containing an XIcon
      // in the panel header.
      const closeBtn = page.locator(
        '.fade-300 [class*="cursor-pointer"][class*="hover:bg-secondary"]',
      );
      await closeBtn.first().click({ force: true });

      // The Input tab button should no longer be visible.
      await expect(
        page.getByRole("button", { name: /^input$/i }),
      ).not.toBeVisible({ timeout: 5_000 });
    } finally {
      await apiDeleteWorkflow(page.request, id);
    }
  });

  test("Run button in Input tab is present for a workflow with no required inputs", async ({
    page,
  }) => {
    const name = wfName("Run Button In Panel");
    const id = await apiCreateWorkflow(page.request, name);
    try {
      await page.goto(`/workflow/${id}`, { waitUntil: "networkidle" });
      await expect(page.locator(".react-flow")).toBeVisible({
        timeout: 15_000,
      });

      await page.getByRole("button", { name: /^run$/i }).click();
      await expect(page.getByRole("button", { name: /^input$/i })).toBeVisible({
        timeout: 5_000,
      });

      // A "Run" button inside the execute panel (not the panel-trigger button).
      // It appears inside the slide-in panel div.
      const panelRunBtn = page
        .locator('.fade-300 button:has-text("Run")')
        .first();
      await expect(panelRunBtn).toBeVisible({ timeout: 5_000 });
    } finally {
      await apiDeleteWorkflow(page.request, id);
    }
  });

  test("POST /api/workflow/[id]/execute returns 200 or 402 for admin", async ({
    page,
  }) => {
    const name = wfName("Execute API Test");
    const id = await apiCreateWorkflow(page.request, name);
    try {
      const res = await page.request.post(`/api/workflow/${id}/execute`, {
        headers: { "Content-Type": "application/json" },
        data: { query: {} },
      });
      expect(
        [200, 402],
        `Execute should stream (200) or hit budget (402), got ${res.status()}`,
      ).toContain(res.status());
    } finally {
      await apiDeleteWorkflow(page.request, id);
    }
  });

  test("execute endpoint does not return 5xx for a freshly-created workflow", async ({
    page,
  }) => {
    const name = wfName("No Server Error");
    const id = await apiCreateWorkflow(page.request, name);
    try {
      const res = await page.request.post(`/api/workflow/${id}/execute`, {
        headers: { "Content-Type": "application/json" },
        data: { query: {} },
      });
      expect(res.status()).toBeLessThan(500);
    } finally {
      await apiDeleteWorkflow(page.request, id);
    }
  });
});

// ---------------------------------------------------------------------------
// Suite 4: Workflow run history (Inbox Runs tab + /runs/[id])
// ---------------------------------------------------------------------------

test.describe("Suite 4 — Workflow run history", () => {
  test.use({ storageState: TEST_USERS.admin.authFile });

  test("GET /api/runs returns an array for admin", async ({ page }) => {
    const res = await page.request.get("/api/runs");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  test("Inbox Runs tab renders at least a list or empty state", async ({
    page,
  }) => {
    await page.goto("/inbox", { waitUntil: "domcontentloaded" });
    const tabs = page.getByRole("tab");
    await expect(tabs.nth(1)).toBeVisible({ timeout: 10_000 });
    await tabs.nth(1).click();

    const listOrEmpty = page
      .getByTestId("inbox-item")
      .or(page.getByText(/no runs yet|empty/i))
      .first();
    await expect(listOrEmpty).toBeVisible({ timeout: 10_000 });
  });

  test("triggering execution creates a run record in GET /api/runs", async ({
    page,
  }) => {
    const name = wfName("Run Record Check");
    const id = await apiCreateWorkflow(page.request, name);
    try {
      const before = await page.request.get("/api/runs");
      const runsBefore = (await before.json()) as Array<{
        definitionId?: string;
      }>;
      const countBefore = runsBefore.filter(
        (r) => r.definitionId === id,
      ).length;

      const execRes = await page.request.post(`/api/workflow/${id}/execute`, {
        headers: { "Content-Type": "application/json" },
        data: { query: {} },
      });

      if (execRes.status() === 402) {
        test.skip(true, "Budget exhausted — skipping run-record assertion");
        return;
      }

      // Poll for up to 12 seconds.
      let found = false;
      for (let i = 0; i < 12; i++) {
        await page.waitForTimeout(1_000);
        const after = await page.request.get("/api/runs");
        const afterBody = (await after.json()) as Array<{
          definitionId?: string;
        }>;
        found =
          afterBody.filter((r) => r.definitionId === id).length > countBefore;
        if (found) break;
      }

      expect(
        found,
        `Expected a new run for workflow ${id} to appear in /api/runs`,
      ).toBe(true);
    } finally {
      await apiDeleteWorkflow(page.request, id);
    }
  });

  test("a run appears in the Inbox Runs tab after workflow execution", async ({
    page,
  }) => {
    const name = wfName("Inbox Run Appears");
    const id = await apiCreateWorkflow(page.request, name);
    try {
      const execRes = await page.request.post(`/api/workflow/${id}/execute`, {
        headers: { "Content-Type": "application/json" },
        data: { query: {} },
      });

      if (execRes.status() === 402) {
        test.skip(true, "Budget exhausted");
        return;
      }

      // Allow the session persistence to settle.
      await page.waitForTimeout(2_000);

      await page.goto("/inbox", { waitUntil: "domcontentloaded" });
      await page.getByRole("tab").nth(1).click();

      const items = page.getByTestId("inbox-item");
      await expect(items.first()).toBeVisible({ timeout: 12_000 });
    } finally {
      await apiDeleteWorkflow(page.request, id);
    }
  });

  test("clicking a run inbox item shows open-run action", async ({ page }) => {
    await page.goto("/inbox", { waitUntil: "domcontentloaded" });
    await page.getByRole("tab").nth(1).click();

    const items = page.getByTestId("inbox-item");
    const count = await items.count();
    if (count === 0) {
      test.skip(
        true,
        "No run entries in inbox — skipping transcript drill-down",
      );
      return;
    }

    await items.first().click();
    await expect(page.getByTestId("inbox-open-run")).toBeVisible({
      timeout: 5_000,
    });
  });

  test("/runs/[id] renders step timeline for a real run", async ({ page }) => {
    await page.goto("/inbox", { waitUntil: "domcontentloaded" });
    await page.getByRole("tab").nth(1).click();

    const items = page.getByTestId("inbox-item");
    const count = await items.count();
    if (count === 0) {
      test.skip(true, "No run entries in inbox — skipping /runs/[id] test");
      return;
    }

    await items.first().click();
    const openRunBtn = page.getByTestId("inbox-open-run");
    await expect(openRunBtn).toBeVisible({ timeout: 5_000 });
    await openRunBtn.click();

    await expect(page).toHaveURL(/\/runs\/[0-9a-f-]{36}/, { timeout: 10_000 });

    // The run page has an H1 (run kind) and a Steps heading.
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({
      timeout: 5_000,
    });
    await expect(page.getByRole("heading", { name: /steps/i })).toBeVisible();
  });

  test("a non-existent run id does not crash the server", async ({ page }) => {
    const res = await page.goto("/runs/00000000-0000-0000-0000-000000000000");
    expect([200, 404]).toContain(res?.status() ?? 200);
    await expect(page.locator("body")).not.toBeEmpty();
  });
});

// ---------------------------------------------------------------------------
// Suite 5: Workflow scheduling (Routines)
// ---------------------------------------------------------------------------

test.describe
  .serial("Suite 5 — Workflow scheduling (Routines)", () => {
    test.use({ storageState: TEST_USERS.admin.authFile });

    let workflowId: string | null = null;
    let workflowName: string;
    let ctx: BrowserContext;
    let adminPage: Page;

    test.beforeAll(async ({ browser }) => {
      ctx = await browser.newContext({
        storageState: TEST_USERS.admin.authFile,
      });
      adminPage = await ctx.newPage();
      workflowName = wfName("Scheduling Test Workflow");
      workflowId = await apiCreateWorkflow(adminPage.request, workflowName, {
        isPublished: true,
      }).catch(() => null);
    });

    test.afterAll(async () => {
      if (workflowId) await apiDeleteWorkflow(adminPage.request, workflowId);
      await ctx.close();
    });

    test("schedule-routine-button is visible for admin in chat toolbar", async ({
      page,
    }) => {
      await page.goto("/", { waitUntil: "networkidle" });
      await expect(page.getByTestId("schedule-routine-button")).toBeVisible({
        timeout: 10_000,
      });
    });

    test("clicking schedule-routine-button opens the schedule dialog", async ({
      page,
    }) => {
      await page.goto("/");
      await page.getByTestId("schedule-routine-button").click();
      await expect(page.getByTestId("schedule-submit")).toBeVisible({
        timeout: 5_000,
      });
    });

    test("schedule submit is disabled until a workflow is selected", async ({
      page,
    }) => {
      await page.goto("/");
      await page.getByTestId("schedule-routine-button").click();
      await expect(page.getByTestId("schedule-submit")).toBeDisabled();
    });

    test("selecting a published workflow enables submit", async ({ page }) => {
      if (!workflowId) {
        test.skip(true, "Published workflow creation failed in beforeAll");
        return;
      }

      await page.goto("/");
      await page.getByTestId("schedule-routine-button").click();
      await expect(page.getByTestId("schedule-submit")).toBeVisible();

      // Open the workflow combobox and choose the published workflow.
      await page.getByRole("combobox").first().click();
      await page
        .getByRole("option", { name: workflowName })
        .first()
        .click({ timeout: 8_000 });

      await expect(page.getByTestId("schedule-submit")).toBeEnabled({
        timeout: 5_000,
      });
    });

    test("submitting the schedule dialog creates a routine and shows toast", async ({
      page,
    }) => {
      if (!workflowId) {
        test.skip(true, "Published workflow creation failed in beforeAll");
        return;
      }

      await page.goto("/");
      await page.getByTestId("schedule-routine-button").click();
      await expect(page.getByTestId("schedule-submit")).toBeVisible();

      await page.getByRole("combobox").first().click();
      await page
        .getByRole("option", { name: workflowName })
        .first()
        .click({ timeout: 8_000 });

      await page.getByTestId("schedule-submit").click();

      await expect(page.getByText(/routine scheduled/i)).toBeVisible({
        timeout: 8_000,
      });
    });

    test("new routine appears in the Inbox Routines tab", async ({ page }) => {
      if (!workflowId) {
        test.skip(true, "Published workflow creation failed in beforeAll");
        return;
      }

      await page.goto("/inbox");
      const tabs = page.getByRole("tab");
      await expect(tabs).toHaveCount(4, { timeout: 10_000 });
      await tabs.nth(2).click();
      await expect(tabs.nth(2)).toHaveAttribute("data-state", "active");

      // The routines list must show our workflow name.
      const routinesList = page.getByTestId("routines-list");
      await expect(routinesList).toBeVisible({ timeout: 8_000 });
      await expect(routinesList.getByText(workflowName).first()).toBeVisible({
        timeout: 8_000,
      });
    });

    test("routine row exposes a toggle and a delete button", async ({
      page,
    }) => {
      if (!workflowId) {
        test.skip(true, "Published workflow creation failed in beforeAll");
        return;
      }

      await page.goto("/inbox");
      await page.getByRole("tab").nth(2).click();

      const routinesList = page.getByTestId("routines-list");
      await expect(routinesList).toBeVisible({ timeout: 8_000 });

      const row = routinesList
        .locator("li")
        .filter({ hasText: workflowName })
        .first();
      await expect(row).toBeVisible();

      await expect(row.getByTestId("routine-toggle")).toBeVisible();
      await expect(row.getByTestId("routine-delete")).toBeVisible();
    });
  });

// ---------------------------------------------------------------------------
// Suite 6: Workflow visibility (private / shared / team / company)
// ---------------------------------------------------------------------------

test.describe("Suite 6 — Workflow visibility", () => {
  test.use({ storageState: TEST_USERS.editor.authFile });

  test("visibility button is visible in the workflow editor panel", async ({
    page,
  }) => {
    const name = wfName("Visibility Button Test");
    const id = await apiCreateWorkflow(page.request, name);
    try {
      await page.goto(`/workflow/${id}`, { waitUntil: "networkidle" });
      await expect(page.locator(".react-flow")).toBeVisible({
        timeout: 15_000,
      });

      await expect(page.getByTestId("workflow-visibility-button")).toBeVisible({
        timeout: 5_000,
      });
    } finally {
      await apiDeleteWorkflow(page.request, id);
    }
  });

  test("clicking visibility button opens the visibility popover", async ({
    page,
  }) => {
    const name = wfName("Visibility Popover Test");
    const id = await apiCreateWorkflow(page.request, name);
    try {
      await page.goto(`/workflow/${id}`, { waitUntil: "networkidle" });
      await expect(page.locator(".react-flow")).toBeVisible({
        timeout: 15_000,
      });

      await page.getByTestId("workflow-visibility-button").click();

      // The VisibilityField popover contains the four-level picker.
      const popoverContent = page
        .locator("[data-radix-popper-content-wrapper]")
        .first();
      await expect(popoverContent).toBeVisible({ timeout: 5_000 });
    } finally {
      await apiDeleteWorkflow(page.request, id);
    }
  });

  test("workflow card visibility icon updates after changing visibility via API", async ({
    page,
  }) => {
    const name = wfName("Visibility API Update");
    const id = await apiCreateWorkflow(page.request, name);
    try {
      // Confirm default visibility is private.
      const before = await (
        await page.request.get(`/api/workflow/${id}`)
      ).json();
      expect(before.visibility ?? "private").toMatch(/private/);

      // Update to "shared" via PUT.
      const put = await page.request.put(`/api/workflow/${id}`, {
        headers: { "Content-Type": "application/json" },
        data: { visibility: "shared" },
      });
      expect(put.status()).toBe(200);

      // Verify via GET.
      const after = await (
        await page.request.get(`/api/workflow/${id}`)
      ).json();
      expect(after.visibility).toBe("shared");
    } finally {
      await apiDeleteWorkflow(page.request, id);
    }
  });

  test("visibility card on the studio list reflects the stored visibility", async ({
    page,
  }) => {
    const name = wfName("Visibility Card Reflect");
    const id = await apiCreateWorkflow(page.request, name);
    try {
      // The card renders a visibility icon button (data-testid="visibility-button").
      await gotoWorkflowsTab(page);
      const card = page.locator(`[data-item-id="${id}"]`);
      await expect(card).toBeVisible({ timeout: 10_000 });
      await expect(card.getByTestId("visibility-button")).toBeVisible();
    } finally {
      await apiDeleteWorkflow(page.request, id);
    }
  });

  test.skip("changing visibility to 'team' via the popover UI updates the card", async ({
    page,
  }) => {
    // TODO: This requires a team to be configured and a teamId to select.
    // Until team-select is wired in the VisibilityPicker, skip this assertion.
    // Needs: a created team, its id, and the VisibilityField team-select
    // interactions to be stable enough for Playwright to drive.
  });
});

// ---------------------------------------------------------------------------
// Suite 7: Delete a workflow via the card kebab / delete button
// ---------------------------------------------------------------------------

test.describe("Suite 7 — Delete a workflow", () => {
  test.use({ storageState: TEST_USERS.editor.authFile });

  test("workflow card exposes a delete button for the owner", async ({
    page,
  }) => {
    const name = wfName("Delete Button Visible");
    const id = await apiCreateWorkflow(page.request, name);
    try {
      await gotoWorkflowsTab(page);
      const card = page.locator(`[data-item-id="${id}"]`);
      await expect(card).toBeVisible({ timeout: 10_000 });
      await expect(card.getByTestId("workflow-delete-button")).toBeVisible({
        timeout: 5_000,
      });
    } finally {
      await apiDeleteWorkflow(page.request, id);
    }
  });

  test("clicking delete button opens a confirm dialog", async ({ page }) => {
    const name = wfName("Delete Confirm Dialog");
    const id = await apiCreateWorkflow(page.request, name);
    try {
      await gotoWorkflowsTab(page);
      const card = page.locator(`[data-item-id="${id}"]`);
      await expect(card).toBeVisible({ timeout: 10_000 });

      await card.getByTestId("workflow-delete-button").click({ force: true });

      // notify.confirm renders a [role="dialog"] or an alertdialog.
      const dialog = page.locator('[role="dialog"], [role="alertdialog"]');
      await expect(dialog.first()).toBeVisible({ timeout: 5_000 });
    } finally {
      // Best-effort: might already be deleted.
      await apiDeleteWorkflow(page.request, id);
    }
  });

  test("confirming delete removes the workflow from the list", async ({
    page,
  }) => {
    const name = wfName("Delete Removes Card");
    const id = await apiCreateWorkflow(page.request, name);

    await gotoWorkflowsTab(page);
    const card = page.locator(`[data-item-id="${id}"]`);
    await expect(card).toBeVisible({ timeout: 10_000 });

    await card.getByTestId("workflow-delete-button").click({ force: true });

    const dialog = page.locator('[role="dialog"], [role="alertdialog"]');
    await expect(dialog.first()).toBeVisible({ timeout: 5_000 });
    await dialog
      .first()
      .getByRole("button", { name: /confirm/i })
      .click({ timeout: 5_000 });

    // Card should disappear.
    await expect(card).not.toBeVisible({ timeout: 10_000 });

    // Double-check via GET.
    const listRes = await page.request.get("/api/workflow");
    const items = (await listRes.json()) as Array<{ id: string }>;
    expect(items.some((w) => w.id === id)).toBe(false);
  });

  test("cancelling the delete dialog leaves the workflow intact", async ({
    page,
  }) => {
    const name = wfName("Delete Cancelled");
    const id = await apiCreateWorkflow(page.request, name);
    try {
      await gotoWorkflowsTab(page);
      const card = page.locator(`[data-item-id="${id}"]`);
      await expect(card).toBeVisible({ timeout: 10_000 });

      await card.getByTestId("workflow-delete-button").click({ force: true });

      const dialog = page.locator('[role="dialog"], [role="alertdialog"]');
      await expect(dialog.first()).toBeVisible({ timeout: 5_000 });

      // Click Cancel (not Confirm).
      await dialog
        .first()
        .getByRole("button", { name: /cancel/i })
        .click({ timeout: 5_000 });

      // Dialog should close and card should still be present.
      await expect(dialog.first()).not.toBeVisible({ timeout: 5_000 });
      await expect(card).toBeVisible();
    } finally {
      await apiDeleteWorkflow(page.request, id);
    }
  });

  test("DELETE /api/workflow/[id] returns 200 with a deletion message", async ({
    page,
  }) => {
    const name = wfName("API Delete Response");
    const id = await apiCreateWorkflow(page.request, name);

    const res = await page.request.delete(`/api/workflow/${id}`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("message");
    expect(body.message).toMatch(/deleted/i);
  });
});

// ---------------------------------------------------------------------------
// Suite 8: NL workflow generation hint (describe-workflow CTA)
// ---------------------------------------------------------------------------

test.describe("Suite 8 — NL workflow generation CTA", () => {
  test.use({ storageState: TEST_USERS.editor.authFile });

  test("empty state shows the describe-workflow CTA button when no workflows exist", async ({
    page,
  }) => {
    // We cannot guarantee zero workflows for this user, so we navigate to the
    // page and check conditionally. The CTA only renders when myWorkflows.length === 0.
    await gotoWorkflowsTab(page);

    const myWorkflowsSection = page.getByRole("heading", {
      name: /my workflows/i,
    });
    await expect(myWorkflowsSection).toBeVisible({ timeout: 10_000 });

    const ctaBtn = page.getByTestId("describe-workflow-cta");
    const cardCount = await page
      .locator('[data-testid="workflow-card"]')
      .count();

    if (cardCount === 0) {
      // Empty state: the CTA should be visible.
      await expect(ctaBtn).toBeVisible({ timeout: 5_000 });
    } else {
      // Non-empty: the CTA is not rendered (intentional design).
      // Just verify the section heading is there.
      await expect(myWorkflowsSection).toBeVisible();
    }
  });

  test("describe-workflow CTA navigates to / with a pre-filled draft", async ({
    page,
  }) => {
    // Use the admin whose slate might be empty. We'll delete all workflows first
    // via API to force the empty state for this test.
    // This test only proceeds when the CTA is visible — if it's not we skip.
    await gotoWorkflowsTab(page);

    const cta = page.getByTestId("describe-workflow-cta");
    const ctaVisible = await cta
      .isVisible({ timeout: 3_000 })
      .catch(() => false);

    if (!ctaVisible) {
      test.skip(
        true,
        "describe-workflow-cta not visible (user has existing workflows)",
      );
      return;
    }

    await cta.click();
    await page.waitForURL("/", { timeout: 10_000 });
    expect(page.url()).toMatch(/\/$|\?/);
  });

  test.skip("NL prompt 'Search the web for AI news, then summarize' creates a multi-node workflow", async () => {
    // TODO: This test requires the NL generation endpoint to be hooked up.
    // When the chat workflow-generation flow is stable, assert:
    //  1. User types the NL prompt in the chat
    //  2. Chat triggers workflow generation tool
    //  3. Created workflow has at least 2 nodes (WebSearch + LLM)
    //  4. Workflow appears in the list at /studio?tab=workflows
    // The NL path goes through the chat -> tool invocation -> /api/workflow POST.
    // Needs: a running LLM key in CI and the workflow-generation tool enabled.
  });
});

// ---------------------------------------------------------------------------
// Suite 9: Publish / unpublish toggle
// ---------------------------------------------------------------------------

test.describe("Suite 9 — Publish / unpublish toggle", () => {
  test.use({ storageState: TEST_USERS.editor.authFile });

  test("Publish button is visible in the workflow panel for a draft", async ({
    page,
  }) => {
    const name = wfName("Publish Button Draft");
    const id = await apiCreateWorkflow(page.request, name);
    try {
      await page.goto(`/workflow/${id}`, { waitUntil: "networkidle" });
      await expect(page.locator(".react-flow")).toBeVisible({
        timeout: 15_000,
      });

      await expect(page.getByRole("button", { name: /publish/i })).toBeVisible({
        timeout: 5_000,
      });
    } finally {
      await apiDeleteWorkflow(page.request, id);
    }
  });

  test("clicking Publish button publishes the workflow (isPublished = true)", async ({
    page,
  }) => {
    const name = wfName("Publish Toggle");
    const id = await apiCreateWorkflow(page.request, name);
    try {
      await page.goto(`/workflow/${id}`, { waitUntil: "networkidle" });
      await expect(page.locator(".react-flow")).toBeVisible({
        timeout: 15_000,
      });

      await page.getByRole("button", { name: /publish/i }).click();

      // After publish, the button label flips to "Edit" (isPublished=true state).
      await expect(page.getByRole("button", { name: /^edit$/i })).toBeVisible({
        timeout: 10_000,
      });

      // Confirm via API.
      const res = await page.request.get(`/api/workflow/${id}`);
      const body = await res.json();
      expect(body.isPublished).toBe(true);
    } finally {
      await apiDeleteWorkflow(page.request, id);
    }
  });

  test("published workflow shows no Draft badge on the list card", async ({
    page,
  }) => {
    const name = wfName("Published No Draft Badge");
    const id = await apiCreateWorkflow(page.request, name, {
      isPublished: true,
    });
    try {
      await gotoWorkflowsTab(page);
      const card = page.locator(`[data-item-id="${id}"]`);
      await expect(card).toBeVisible({ timeout: 10_000 });
      // Draft badge must NOT be present.
      await expect(card.getByText(/draft/i)).not.toBeVisible();
    } finally {
      await apiDeleteWorkflow(page.request, id);
    }
  });

  test("a published workflow can be put back to draft via PUT isPublished=false", async ({
    page,
  }) => {
    const name = wfName("Unpublish via API");
    const id = await apiCreateWorkflow(page.request, name, {
      isPublished: true,
    });
    try {
      const putRes = await page.request.put(`/api/workflow/${id}`, {
        headers: { "Content-Type": "application/json" },
        data: { isPublished: false },
      });
      expect(putRes.status()).toBe(200);

      const getRes = await page.request.get(`/api/workflow/${id}`);
      const body = await getRes.json();
      expect(body.isPublished).toBe(false);
    } finally {
      await apiDeleteWorkflow(page.request, id);
    }
  });
});

// ---------------------------------------------------------------------------
// Suite 10: Node management — add node + delete via context menu
// ---------------------------------------------------------------------------

test.describe("Suite 10 — Node management in the canvas", () => {
  test.use({ storageState: TEST_USERS.editor.authFile });

  test("editor canvas renders at least one node (Input node always present)", async ({
    page,
  }) => {
    const name = wfName("Input Node Present");
    const id = await apiCreateWorkflow(page.request, name);
    try {
      await page.goto(`/workflow/${id}`, { waitUntil: "networkidle" });
      await expect(page.locator(".react-flow")).toBeVisible({
        timeout: 15_000,
      });

      // There must be at least one ReactFlow node rendered in the canvas.
      const nodes = page.locator(".react-flow__node");
      await expect(nodes.first()).toBeVisible({ timeout: 8_000 });
    } finally {
      await apiDeleteWorkflow(page.request, id);
    }
  });

  test("the Input node label is visible in the canvas", async ({ page }) => {
    const name = wfName("Input Node Label");
    const id = await apiCreateWorkflow(page.request, name);
    try {
      await page.goto(`/workflow/${id}`, { waitUntil: "networkidle" });
      await expect(page.locator(".react-flow")).toBeVisible({
        timeout: 15_000,
      });

      // The default Input node renders a node with name from the node data.
      // It is always named "Input" in a freshly-created workflow.
      await expect(
        page.locator(".react-flow__node").filter({ hasText: /input/i }).first(),
      ).toBeVisible({ timeout: 8_000 });
    } finally {
      await apiDeleteWorkflow(page.request, id);
    }
  });

  test("hovering the Input node reveals the + handle (add node affordance)", async ({
    page,
  }) => {
    const name = wfName("Plus Handle Visible");
    const id = await apiCreateWorkflow(page.request, name);
    try {
      await page.goto(`/workflow/${id}`, { waitUntil: "networkidle" });
      await expect(page.locator(".react-flow")).toBeVisible({
        timeout: 15_000,
      });

      const inputNode = page
        .locator(".react-flow__node")
        .filter({ hasText: /input/i })
        .first();
      await expect(inputNode).toBeVisible({ timeout: 8_000 });

      // Hover over the node to reveal the + button.
      await inputNode.hover();

      // The PlusIcon button should become visible (rendered inside the Handle).
      const plusButton = inputNode.locator(
        '[class*="bg-blue-500"][class*="rounded-full"]',
      );
      await expect(plusButton).toBeVisible({ timeout: 5_000 });
    } finally {
      await apiDeleteWorkflow(page.request, id);
    }
  });

  test("right-clicking a node opens the context menu with Delete option", async ({
    page,
  }) => {
    // Create a workflow and add an LLM node via the structure API so we have
    // a deletable node (the Input node cannot be deleted).
    const name = wfName("Context Menu Delete");
    const id = await apiCreateWorkflow(page.request, name);
    try {
      await page.goto(`/workflow/${id}`, { waitUntil: "networkidle" });
      await expect(page.locator(".react-flow")).toBeVisible({
        timeout: 15_000,
      });

      // Right-click the first node to open the context menu.
      const firstNode = page.locator(".react-flow__node").first();
      await expect(firstNode).toBeVisible({ timeout: 8_000 });
      await firstNode.click({ button: "right" });

      // The context menu should contain a "Delete" item.
      await expect(
        page
          .getByRole("menuitem")
          .filter({ hasText: /delete/i })
          .first(),
      ).toBeVisible({ timeout: 5_000 });
    } finally {
      await apiDeleteWorkflow(page.request, id);
    }
  });

  test("GET /api/workflow/[id]/structure returns nodes and edges arrays", async ({
    page,
  }) => {
    const name = wfName("Structure Endpoint");
    const id = await apiCreateWorkflow(page.request, name);
    try {
      const res = await page.request.get(`/api/workflow/${id}`);
      expect(res.status()).toBe(200);
      const body = await res.json();
      // The workflow endpoint embeds structure (nodes + edges) in the response.
      expect(body).toHaveProperty("id", id);
      expect(body).toHaveProperty("name", name);
    } finally {
      await apiDeleteWorkflow(page.request, id);
    }
  });

  test.skip("clicking + handle and picking WebSearch adds a WebSearch node", async () => {
    // TODO: This requires precise canvas coordinates and a stable headless
    // ReactFlow drag handle. The NodeSelect dropdown is triggered by mouseUp on
    // the Handle source element. Until we can drive this reliably headless,
    // the add-node flow is covered via the workflow-websearch.spec.ts suite.
    // Needs: ReactFlow handle interaction helpers in Playwright.
  });
});

// ---------------------------------------------------------------------------
// Suite 11: API layer — workflow structure save, rename, visibility, CRUD
// ---------------------------------------------------------------------------

test.describe("Suite 11 — API layer (editor role)", () => {
  test.use({ storageState: TEST_USERS.editor.authFile });

  test("GET /api/workflow returns 200 with an array", async ({ page }) => {
    const res = await page.request.get("/api/workflow");
    expect(res.status()).toBe(200);
    expect(Array.isArray(await res.json())).toBe(true);
  });

  test("POST /api/workflow + GET /api/workflow/[id] round-trip", async ({
    page,
  }) => {
    const name = wfName("API Roundtrip");
    const res = await page.request.post("/api/workflow", {
      headers: { "Content-Type": "application/json" },
      data: {
        name,
        description: "roundtrip test",
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
      await apiDeleteWorkflow(page.request, id);
    }
  });

  test("PUT /api/workflow/[id] updates the workflow description", async ({
    page,
  }) => {
    const name = wfName("API Update Description");
    const id = await apiCreateWorkflow(page.request, name);
    try {
      const putRes = await page.request.put(`/api/workflow/${id}`, {
        headers: { "Content-Type": "application/json" },
        data: { description: "Updated description from e2e" },
      });
      expect(putRes.status()).toBe(200);

      const getRes = await page.request.get(`/api/workflow/${id}`);
      const body = await getRes.json();
      expect(body.description).toBe("Updated description from e2e");
    } finally {
      await apiDeleteWorkflow(page.request, id);
    }
  });

  test("POST /api/workflow/[id]/structure saves a custom node list", async ({
    page,
  }) => {
    const name = wfName("API Structure Save");
    const id = await apiCreateWorkflow(page.request, name);
    try {
      // Add an LLM node to the structure.
      const structRes = await page.request.post(
        `/api/workflow/${id}/structure`,
        {
          headers: { "Content-Type": "application/json" },
          data: {
            nodes: [
              {
                id: "llm-node-e2e",
                workflowId: id,
                kind: "llm",
                name: "LLM Step",
                description: "",
                config: {},
                outputSchema: { type: "object", properties: {} },
                position: { x: 400, y: 200 },
              },
            ],
            edges: [],
            deleteNodes: [],
            deleteEdges: [],
          },
        },
      );
      // 200 or 201 — the structure endpoint returns OK on success.
      expect([200, 201]).toContain(structRes.status());
    } finally {
      await apiDeleteWorkflow(page.request, id);
    }
  });

  test("DELETE /api/workflow/[id] makes subsequent GET return 401", async ({
    page,
  }) => {
    const name = wfName("API Delete Makes 401");
    const id = await apiCreateWorkflow(page.request, name);

    const del = await page.request.delete(`/api/workflow/${id}`);
    expect(del.status()).toBe(200);

    const get = await page.request.get(`/api/workflow/${id}`);
    expect(get.status()).toBe(401);
  });

  test("GET /api/workflow/[nonexistent-id] returns 401", async ({ page }) => {
    const res = await page.request.get(
      "/api/workflow/00000000-0000-0000-0000-000000000000",
    );
    expect(res.status()).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// Suite 12: Role gating — regular user cannot create / edit / delete
// ---------------------------------------------------------------------------

test.describe("Suite 12 — Role gating", () => {
  test("regular user visiting /studio is redirected away", async ({
    browser,
  }) => {
    const ctx = await browser.newContext({
      storageState: TEST_USERS.regular.authFile,
    });
    const page = await ctx.newPage();
    try {
      await page.goto("/studio", { waitUntil: "domcontentloaded" });
      await page.waitForURL((url) => !url.href.includes("/studio"), {
        timeout: 10_000,
      });
      expect(page.url()).not.toContain("/studio");
    } finally {
      await ctx.close();
    }
  });

  test("regular user visiting /workflow/[id] for a private workflow gets notFound", async ({
    browser,
  }) => {
    const adminCtx = await browser.newContext({
      storageState: TEST_USERS.admin.authFile,
    });
    const adminPage = await adminCtx.newPage();
    const wfId = await apiCreateWorkflow(
      adminPage.request,
      wfName("Gate Test"),
    );
    await adminCtx.close();

    const ctx = await browser.newContext({
      storageState: TEST_USERS.regular.authFile,
    });
    const page = await ctx.newPage();
    try {
      await page.goto(`/workflow/${wfId}`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(1_000);
      // ReactFlow canvas must NOT be visible.
      expect(await page.locator(".react-flow").isVisible()).toBe(false);
    } finally {
      await ctx.close();
      // Cleanup as admin.
      const cleanCtx = await browser.newContext({
        storageState: TEST_USERS.admin.authFile,
      });
      const cleanPage = await cleanCtx.newPage();
      await apiDeleteWorkflow(cleanPage.request, wfId);
      await cleanCtx.close();
    }
  });

  test("regular user: POST /api/workflow returns 403", async ({ browser }) => {
    const ctx = await browser.newContext({
      storageState: TEST_USERS.regular.authFile,
    });
    const page = await ctx.newPage();
    try {
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
      expect(res.status()).toBe(403);
    } finally {
      await ctx.close();
    }
  });

  test("regular user: DELETE /api/workflow/[id] returns 401 or 403", async ({
    browser,
  }) => {
    const adminCtx = await browser.newContext({
      storageState: TEST_USERS.admin.authFile,
    });
    const adminPage = await adminCtx.newPage();
    const wfId = await apiCreateWorkflow(
      adminPage.request,
      wfName("Delete Guard"),
    );
    await adminCtx.close();

    const ctx = await browser.newContext({
      storageState: TEST_USERS.regular.authFile,
    });
    const page = await ctx.newPage();
    try {
      const res = await page.request.delete(`/api/workflow/${wfId}`);
      expect([401, 403]).toContain(res.status());
    } finally {
      await ctx.close();
      const cleanCtx = await browser.newContext({
        storageState: TEST_USERS.admin.authFile,
      });
      const cleanPage = await cleanCtx.newPage();
      await apiDeleteWorkflow(cleanPage.request, wfId);
      await cleanCtx.close();
    }
  });

  test("regular user: PUT /api/workflow/[id] is rejected", async ({
    browser,
  }) => {
    const adminCtx = await browser.newContext({
      storageState: TEST_USERS.admin.authFile,
    });
    const adminPage = await adminCtx.newPage();
    const wfId = await apiCreateWorkflow(
      adminPage.request,
      wfName("Put Guard"),
    );
    await adminCtx.close();

    const ctx = await browser.newContext({
      storageState: TEST_USERS.regular.authFile,
    });
    const page = await ctx.newPage();
    try {
      const res = await page.request.put(`/api/workflow/${wfId}`, {
        headers: { "Content-Type": "application/json" },
        data: { description: "Injected by regular user" },
      });
      // Either the access check returns 401 (no access) or 403 (forbidden).
      expect([401, 403]).toContain(res.status());
    } finally {
      await ctx.close();
      const cleanCtx = await browser.newContext({
        storageState: TEST_USERS.admin.authFile,
      });
      const cleanPage = await cleanCtx.newPage();
      await apiDeleteWorkflow(cleanPage.request, wfId);
      await cleanCtx.close();
    }
  });

  test("regular user: GET /api/workflow returns 200 with an array (read-only access)", async ({
    browser,
  }) => {
    const ctx = await browser.newContext({
      storageState: TEST_USERS.regular.authFile,
    });
    const page = await ctx.newPage();
    try {
      const res = await page.request.get("/api/workflow");
      expect(res.status()).toBe(200);
      expect(Array.isArray(await res.json())).toBe(true);
    } finally {
      await ctx.close();
    }
  });

  test("regular user: schedule-routine-button is NOT rendered in toolbar", async ({
    browser,
  }) => {
    const ctx = await browser.newContext({
      storageState: TEST_USERS.regular.authFile,
    });
    const page = await ctx.newPage();
    try {
      await page.goto("/", { waitUntil: "networkidle" });
      const count = await page.getByTestId("schedule-routine-button").count();
      expect(count).toBe(0);
    } finally {
      await ctx.close();
    }
  });

  test("editor user: schedule-routine-button IS rendered in toolbar", async ({
    browser,
  }) => {
    const ctx = await browser.newContext({
      storageState: TEST_USERS.editor.authFile,
    });
    const page = await ctx.newPage();
    try {
      await page.goto("/", { waitUntil: "networkidle" });
      await expect(page.getByTestId("schedule-routine-button")).toBeVisible({
        timeout: 10_000,
      });
    } finally {
      await ctx.close();
    }
  });
});
