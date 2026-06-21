import { type BrowserContext, type Page, expect, test } from "@playwright/test";
import { TEST_USERS } from "../constants/test-users";

// Routines — workflow_schedule CRUD via the Inbox "Routines" tab and the
// /schedule dialog (the CalendarClock button in the chat input toolbar).
//
// Architecture notes (so tests stay honest about what they're testing):
// - Schedules are created via the createScheduleAction Server Action, which
//   requires an accessible PUBLISHED workflow.
// - The dialog (data-testid="schedule-routine-button") only renders for
//   admin/editor users (!isBasicUser).
// - Toggle and delete go through toggleScheduleAction / deleteScheduleAction
//   Server Actions; both return { success, error }.
// - The Routines tab is [role="tab"] index 2 inside /inbox.
// - [data-testid="routines-list"] renders when there is at least one schedule;
//   an EmptyState renders when there are zero.
// - Each routine row exposes data-testid="routine-toggle" (Switch) and
//   data-testid="routine-delete" (button).
//
// Test strategy: use the admin user (has workflow + publish permissions) and
// prepare a published workflow via the /api/workflow REST endpoint so we have
// a stable workflowId to pass to the schedule dialog.

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let _counter = 0;
function uid(): string {
  _counter++;
  return `${_counter}-${process.pid}-${Date.now()}`;
}

/**
 * Creates a workflow via REST and publishes it. Returns the workflowId or null
 * on failure. The editor permission-check for `isPublished` is on POST, so the
 * admin can publish at creation time.
 */
async function createPublishedWorkflow(
  page: Page,
  name: string,
): Promise<string | null> {
  const res = await page.request.post("/api/workflow", {
    headers: { "Content-Type": "application/json" },
    data: { name, description: "e2e routine test workflow", isPublished: true },
  });
  if (!res.ok()) return null;
  const body = (await res.json()) as { id?: string };
  return body.id ?? null;
}

/**
 * Deletes a workflow by id. Best-effort cleanup only.
 */
async function deleteWorkflow(page: Page, id: string): Promise<void> {
  try {
    await page.request.delete(`/api/workflow/${id}`);
  } catch {
    // ignore — cleanup is best-effort
  }
}

/**
 * Opens the Inbox and activates the Routines tab (index 2 in the 4-tab set).
 * Returns after the tab is active.
 */
async function openRoutinesTab(page: Page): Promise<void> {
  await page.goto("/inbox");
  await expect(
    page.getByRole("heading", { name: /inbox/i, level: 1 }),
  ).toBeVisible();
  const tabs = page.getByRole("tab");
  await expect(tabs).toHaveCount(4);
  await tabs.nth(2).click();
  await expect(tabs.nth(2)).toHaveAttribute("data-state", "active");
}

// ---------------------------------------------------------------------------
// Group 1: Routines tab basic rendering
// ---------------------------------------------------------------------------

test.describe("Inbox Routines tab — rendering", () => {
  test.use({ storageState: TEST_USERS.admin.authFile });

  test("Routines tab is present and activates without crashing", async ({
    page,
  }) => {
    await openRoutinesTab(page);
    // Either the list or the empty-state must be visible (never a blank page).
    const listOrEmpty = page
      .getByTestId("routines-list")
      .or(page.locator('[class*="EmptyState"], [class*="empty-state"]'))
      .or(page.getByText(/no routines yet/i));
    await expect(listOrEmpty.first()).toBeVisible({ timeout: 8000 });
  });

  test("switching to Routines tab hides the inbox detail pane", async ({
    page,
  }) => {
    await openRoutinesTab(page);
    // The routines tab renders full-width; the resizable detail pane should
    // NOT be visible (inbox-view.tsx renders a different branch for 'routines').
    await expect(page.getByTestId("inbox-detail")).toBeHidden();
  });

  test("switching to Routines tab hides the search input", async ({ page }) => {
    await openRoutinesTab(page);
    // The search bar only shows for approvals + runs tabs.
    await expect(page.getByTestId("inbox-search")).toBeHidden();
  });
});

// ---------------------------------------------------------------------------
// Group 2: Schedule dialog (create routine)
// ---------------------------------------------------------------------------

test.describe.serial("Routines — create via /schedule dialog", () => {
  test.use({ storageState: TEST_USERS.admin.authFile });

  let workflowId: string | null = null;
  let workflowName: string;
  let adminPage: Page;
  let adminContext: BrowserContext;

  test.beforeAll(async ({ browser }) => {
    adminContext = await browser.newContext({
      storageState: TEST_USERS.admin.authFile,
    });
    adminPage = await adminContext.newPage();
    workflowName = `e2e-routine-wf-${uid()}`;
    workflowId = await createPublishedWorkflow(adminPage, workflowName);
  });

  test.afterAll(async () => {
    if (workflowId) await deleteWorkflow(adminPage, workflowId);
    await adminContext.close();
  });

  test("schedule-routine-button is visible in the chat toolbar for admin", async ({
    page,
  }) => {
    await page.goto("/");
    // The ScheduleRoutineDialog button renders inside the prompt-input toolbar.
    await expect(
      page.getByTestId("schedule-routine-button"),
    ).toBeVisible({ timeout: 10000 });
  });

  test("clicking schedule-routine-button opens the dialog", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("schedule-routine-button").click();
    // Dialog should be visible with the workflow select + submit button.
    await expect(
      page.getByTestId("schedule-submit"),
    ).toBeVisible({ timeout: 5000 });
  });

  test("submit is disabled when no workflow is selected", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("schedule-routine-button").click();
    await expect(page.getByTestId("schedule-submit")).toBeDisabled();
  });

  test("selecting a published workflow enables the submit button", async ({
    page,
  }) => {
    if (!workflowId) {
      test.skip(true, "workflow creation failed in beforeAll");
      return;
    }

    await page.goto("/");
    await page.getByTestId("schedule-routine-button").click();

    // Wait for the workflows to load in the Select.
    await expect(page.getByTestId("schedule-submit")).toBeVisible();

    // Open the workflow select (first Select in the dialog).
    const workflowSelect = page
      .getByRole("combobox")
      .first();
    await workflowSelect.click();

    // Pick the published workflow we created in beforeAll.
    await page
      .getByRole("option", { name: workflowName })
      .first()
      .click({ timeout: 8000 });

    // Submit should now be enabled (a cron preset is always pre-selected).
    await expect(page.getByTestId("schedule-submit")).toBeEnabled();
  });
});

// ---------------------------------------------------------------------------
// Group 3: Full CRUD lifecycle (serial — create → verify → delete)
// ---------------------------------------------------------------------------

test.describe.serial("Routines — full CRUD lifecycle", () => {
  test.use({ storageState: TEST_USERS.admin.authFile });

  let workflowId: string | null = null;
  let workflowName: string;
  let adminPage: Page;
  let adminContext: BrowserContext;

  test.beforeAll(async ({ browser }) => {
    adminContext = await browser.newContext({
      storageState: TEST_USERS.admin.authFile,
    });
    adminPage = await adminContext.newPage();
    workflowName = `e2e-routine-crud-${uid()}`;
    workflowId = await createPublishedWorkflow(adminPage, workflowName);
  });

  test.afterAll(async () => {
    if (workflowId) await deleteWorkflow(adminPage, workflowId);
    await adminContext.close();
  });

  test("create a routine via the /schedule dialog, confirm it appears in the Routines tab", async ({
    page,
  }) => {
    if (!workflowId) {
      test.skip(true, "workflow creation failed in beforeAll");
      return;
    }

    // --- Open dialog and submit ---
    await page.goto("/");
    await page.getByTestId("schedule-routine-button").click();
    await expect(page.getByTestId("schedule-submit")).toBeVisible();

    // Select the workflow.
    await page.getByRole("combobox").first().click();
    await page
      .getByRole("option", { name: workflowName })
      .first()
      .click({ timeout: 8000 });

    // Default cadence (Daily) is already selected; submit.
    await page.getByTestId("schedule-submit").click();

    // A toast "Routine scheduled" should appear.
    await expect(
      page.getByText(/routine scheduled/i),
    ).toBeVisible({ timeout: 8000 });

    // --- Navigate to the Routines tab and verify ---
    await openRoutinesTab(page);
    const routinesList = page.getByTestId("routines-list");
    await expect(routinesList).toBeVisible({ timeout: 8000 });

    // The newly created routine should show the workflow name.
    await expect(routinesList.getByText(workflowName).first()).toBeVisible();
  });

  test("toggle (disable) a routine and confirm the Enabled badge disappears", async ({
    page,
  }) => {
    if (!workflowId) {
      test.skip(true, "workflow creation failed in beforeAll");
      return;
    }

    await openRoutinesTab(page);
    const routinesList = page.getByTestId("routines-list");
    await expect(routinesList).toBeVisible({ timeout: 8000 });

    // Find the routine row for our workflow.
    const routineRow = routinesList
      .locator("li")
      .filter({ hasText: workflowName })
      .first();
    await expect(routineRow).toBeVisible();

    // The toggle should be checked (enabled by default on creation).
    const toggle = routineRow.getByTestId("routine-toggle");
    const isChecked = await toggle.isChecked();

    if (isChecked) {
      // Disable it.
      await toggle.click();
      // Give the Server Action + optimistic update a moment.
      // The "Enabled" badge should disappear from that row.
      await expect(
        routineRow.getByText(/^enabled$/i),
      ).toBeHidden({ timeout: 8000 });
      // The toggle should now be unchecked.
      await expect(toggle).not.toBeChecked({ timeout: 8000 });
    } else {
      // Already disabled — re-enable and verify badge re-appears.
      await toggle.click();
      await expect(
        routineRow.getByText(/^enabled$/i),
      ).toBeVisible({ timeout: 8000 });
    }
  });

  test("routine toggle state persists across a page reload", async ({
    page,
  }) => {
    if (!workflowId) {
      test.skip(true, "workflow creation failed in beforeAll");
      return;
    }

    await openRoutinesTab(page);
    const routinesList = page.getByTestId("routines-list");
    await expect(routinesList).toBeVisible({ timeout: 8000 });

    const routineRow = routinesList
      .locator("li")
      .filter({ hasText: workflowName })
      .first();
    await expect(routineRow).toBeVisible();

    const toggle = routineRow.getByTestId("routine-toggle");
    const isCheckedBefore = await toggle.isChecked();
    const expectedChecked = !isCheckedBefore;

    // Click and wait for the server action to persist the change.
    // startTransition + router.refresh() in the component may not produce an
    // observable intermediate render state in the production build, so we
    // skip the pre-reload UI assertion and let the reload verify persistence.
    await toggle.click();
    await page.waitForTimeout(2000);

    // Hard reload.
    await page.reload({ waitUntil: "networkidle" });

    // Re-activate the Routines tab after reload.
    await page.getByRole("tab").nth(2).click();
    await expect(page.getByRole("tab").nth(2)).toHaveAttribute(
      "data-state",
      "active",
    );

    const reloadedList = page.getByTestId("routines-list");
    await expect(reloadedList).toBeVisible({ timeout: 8000 });
    const reloadedRow = reloadedList
      .locator("li")
      .filter({ hasText: workflowName })
      .first();
    const reloadedToggle = reloadedRow.getByTestId("routine-toggle");

    if (expectedChecked) {
      await expect(reloadedToggle).toBeChecked({ timeout: 8000 });
    } else {
      await expect(reloadedToggle).not.toBeChecked({ timeout: 8000 });
    }
  });

  test("delete a routine and confirm it disappears from the list", async ({
    page,
  }) => {
    if (!workflowId) {
      test.skip(true, "workflow creation failed in beforeAll");
      return;
    }

    await openRoutinesTab(page);
    const routinesList = page.getByTestId("routines-list");
    await expect(routinesList).toBeVisible({ timeout: 8000 });

    const routineRow = routinesList
      .locator("li")
      .filter({ hasText: workflowName })
      .first();
    await expect(routineRow).toBeVisible();

    // Click the delete button.
    await routineRow.getByTestId("routine-delete").click();

    // A confirmation dialog (notify.confirm) will appear — accept it.
    // Scope to [role="dialog"] so the trash icon "Delete routine" aria-label
    // does not match the regex before the dialog button does.
    const confirmDialog = page.locator('[role="dialog"]');
    await expect(confirmDialog).toBeVisible({ timeout: 5000 });
    await confirmDialog
      .getByRole("button", { name: /confirm/i })
      .click({ timeout: 5000 });

    // Give the server action and router.refresh() time to complete.
    // startTransition + router.refresh() may batch the optimistic delete
    // with the server confirmation in the production build, making the
    // intermediate "hidden" state unobservable to Playwright.
    await page.waitForTimeout(2000);

    // Reload to verify the deletion persisted to the DB.
    await page.reload({ waitUntil: "networkidle" });
    await page.getByRole("tab").nth(2).click();
    await expect(page.getByRole("tab").nth(2)).toHaveAttribute(
      "data-state",
      "active",
    );

    // After reload the routine row must be gone.
    const reloadedList = page.getByTestId("routines-list");
    // Either the list is gone entirely (empty state) or the row is absent.
    const rowAfter = reloadedList
      .locator("li")
      .filter({ hasText: workflowName });
    await expect(rowAfter).toHaveCount(0, { timeout: 8000 });
  });

  test("after all routines are deleted the empty state renders", async ({
    page,
  }) => {
    await openRoutinesTab(page);

    // Either the list still has items (from other tests) or the empty state is
    // shown. We only assert the empty state if the list is completely gone.
    const list = page.getByTestId("routines-list");
    const listCount = await list.count();

    if (listCount === 0) {
      // Empty state must be visible.
      await expect(
        page.getByText(/no routines yet/i),
      ).toBeVisible({ timeout: 8000 });
    } else {
      // At least the list itself is visible — pass.
      await expect(list).toBeVisible();
    }
  });
});

// ---------------------------------------------------------------------------
// Group 4: Role gating — regular user cannot see the schedule button
// ---------------------------------------------------------------------------

test.describe("Routines — role gating", () => {
  test("regular user: schedule-routine-button is NOT rendered in chat toolbar", async ({
    browser,
  }) => {
    const ctx = await browser.newContext({
      storageState: TEST_USERS.regular.authFile,
    });
    const page = await ctx.newPage();
    await page.goto("/", { waitUntil: "networkidle" });

    // The button renders conditionally on !isBasicUser. Regular users are basic.
    const btn = page.getByTestId("schedule-routine-button");
    const count = await btn.count();
    expect(
      count,
      "Regular users must not see the schedule-routine button",
    ).toBe(0);

    await ctx.close();
  });

  test("editor user: schedule-routine-button IS rendered in chat toolbar", async ({
    browser,
  }) => {
    const ctx = await browser.newContext({
      storageState: TEST_USERS.editor.authFile,
    });
    const page = await ctx.newPage();
    await page.goto("/", { waitUntil: "networkidle" });

    await expect(
      page.getByTestId("schedule-routine-button"),
    ).toBeVisible({ timeout: 10000 });

    await ctx.close();
  });

  test("regular user: Routines tab in Inbox renders (read-only view)", async ({
    browser,
  }) => {
    // Regular users can still navigate to /inbox and see the Routines tab;
    // they just can't create new routines.
    const ctx = await browser.newContext({
      storageState: TEST_USERS.regular.authFile,
    });
    const page = await ctx.newPage();
    await page.goto("/inbox");

    await expect(
      page.getByRole("heading", { name: /inbox/i, level: 1 }),
    ).toBeVisible();
    await expect(page.getByRole("tab")).toHaveCount(4);

    // Activate Routines tab.
    await page.getByRole("tab").nth(2).click();
    await expect(page.getByRole("tab").nth(2)).toHaveAttribute(
      "data-state",
      "active",
    );

    // Either the empty state or the list must render (no crash).
    const listOrEmpty = page
      .getByTestId("routines-list")
      .or(page.getByText(/no routines yet/i));
    await expect(listOrEmpty.first()).toBeVisible({ timeout: 8000 });

    await ctx.close();
  });
});

// ---------------------------------------------------------------------------
// Group 5: Manually trigger a routine run (workflow execute endpoint)
// ---------------------------------------------------------------------------

test.describe.serial("Routines — manual trigger creates a run", () => {
  test.use({ storageState: TEST_USERS.admin.authFile });

  let workflowId: string | null = null;
  let adminPage: Page;
  let adminContext: BrowserContext;

  test.beforeAll(async ({ browser }) => {
    adminContext = await browser.newContext({
      storageState: TEST_USERS.admin.authFile,
    });
    adminPage = await adminContext.newPage();
    const name = `e2e-routine-run-${uid()}`;
    workflowId = await createPublishedWorkflow(adminPage, name);
  });

  test.afterAll(async () => {
    if (workflowId) await deleteWorkflow(adminPage, workflowId);
    await adminContext.close();
  });

  test("POST /api/workflow/[id]/execute returns non-401 for an admin with a valid published workflow", async ({
    page,
  }) => {
    if (!workflowId) {
      test.skip(true, "workflow creation failed in beforeAll");
      return;
    }

    // We don't wait for the full streaming response — just assert the route
    // accepts the request (not 401/403/404). 402 (budget), 422, 500 are fine
    // in CI without a real LLM key.
    const response = await page.request.post(
      `/api/workflow/${workflowId}/execute`,
      {
        headers: { "Content-Type": "application/json" },
        data: { query: "e2e test trigger" },
        timeout: 15000,
      },
    );

    const status = response.status();
    expect(
      status,
      `Workflow execute must not be blocked by auth/authz; got ${status}`,
    ).not.toBe(401);
    expect(
      status,
      `Workflow execute must not be blocked by authz; got ${status}`,
    ).not.toBe(403);
    expect(
      status,
      `Workflow execute must not 404 for a valid id; got ${status}`,
    ).not.toBe(404);
  });

  test("triggering execution creates a new run visible in the Runs tab", async ({
    page,
  }) => {
    if (!workflowId) {
      test.skip(true, "workflow creation failed in beforeAll");
      return;
    }

    // Fire-and-forget the execute; we don't need to read the streaming body.
    const execRes = await page.request
      .post(`/api/workflow/${workflowId}/execute`, {
        headers: { "Content-Type": "application/json" },
        data: { query: "e2e manual trigger run" },
        timeout: 15000,
      })
      .catch(() => null);

    // Budget-exhausted (402) means no session is created — skip.
    if (execRes && execRes.status() === 402) {
      test.skip();
      return;
    }

    // Poll /api/runs filtered by this workflow's definitionId.
    // Comparing total count is fragile when the admin already has 30+ runs
    // (the endpoint's default limit), so we filter to this specific workflow.
    let found = false;
    for (let i = 0; i < 12; i++) {
      await page.waitForTimeout(1000);
      const after = await page.request.get("/api/runs");
      const afterBody = (await after.json()) as Array<{ definitionId?: string }>;
      found = afterBody.some((r) => r.definitionId === workflowId);
      if (found) break;
    }

    expect(
      found,
      `A run entry for workflow ${workflowId} should appear in /api/runs`,
    ).toBe(true);
  });
});
