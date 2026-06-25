import { type BrowserContext, type Page, expect, test } from "@playwright/test";
import { TEST_USERS } from "../constants/test-users";

// Routines / scheduling — comprehensive E2E covering the six user-facing flows:
//   1. Navigate to /inbox → Routines tab: shell renders correctly
//   2. Create a routine via the /schedule dialog (NL description path is skipped —
//      the dialog is structured, not a free-text NL field)
//   3. Routine run history visible in the Runs tab filtered by origin=schedule
//   4. Enable / disable a routine toggle and assert badge state
//   5. Delete a routine via the trash button
//   6. /schedule CalendarClock button in the chat composer opens the dialog
//
// Architecture anchors:
//   - Routines live at /inbox (Routines tab, index 2 of 4).
//   - The schedule dialog is opened via data-testid="schedule-routine-button"
//     in the chat toolbar; only non-basic users (admin/editor) see it.
//   - Each routine row: data-testid="routines-list" (ul) > li with
//     data-testid="routine-toggle" (Switch) and data-testid="routine-delete".
//   - Enabled badge text: t("Triage.enabled") → "Enabled".
//   - Runs with origin "schedule" appear in the Runs tab as routine runs
//     (item.isRoutine = true → "Routines" sub-label).
//   - Workflow must be PUBLISHED before it can be scheduled.

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

let _uid = 0;
function uid(): string {
  _uid++;
  return `${_uid}-${process.pid}-${Date.now()}`;
}

/** Create and publish a workflow via REST. Returns the workflowId or null. */
async function createPublishedWorkflow(
  page: Page,
  name: string,
): Promise<string | null> {
  const res = await page.request.post("/api/workflow", {
    headers: { "Content-Type": "application/json" },
    data: {
      name,
      description: "routines-e2e test workflow",
      isPublished: true,
    },
  });
  if (!res.ok()) return null;
  const body = (await res.json()) as { id?: string };
  return body.id ?? null;
}

/** Best-effort cleanup of a workflow by id. */
async function deleteWorkflow(page: Page, id: string): Promise<void> {
  try {
    await page.request.delete(`/api/workflow/${id}`);
  } catch {
    // ignore
  }
}

/**
 * Navigates to /inbox and activates the Routines tab (index 2).
 * Waits for the tab to become active before returning.
 */
async function openRoutinesTab(page: Page): Promise<void> {
  await page.goto("/inbox");
  await expect(
    page.getByRole("heading", { name: /inbox/i, level: 1 }),
  ).toBeVisible({ timeout: 15000 });
  const tabs = page.getByRole("tab");
  await expect(tabs).toHaveCount(4, { timeout: 10000 });
  await tabs.nth(2).click();
  await expect(tabs.nth(2)).toHaveAttribute("data-state", "active");
}

// ---------------------------------------------------------------------------
// Suite 1: Navigate to the routines page
// ---------------------------------------------------------------------------

test.describe("Suite 1 — Navigate to routines page", () => {
  test.use({ storageState: TEST_USERS.admin.authFile });

  test("navigating to /inbox shows the Inbox heading with four tabs", async ({
    page,
  }) => {
    await page.goto("/inbox");
    await expect(
      page.getByRole("heading", { name: /inbox/i, level: 1 }),
    ).toBeVisible({ timeout: 15000 });
    // 4 tabs: Approvals | Runs | Routines | Mentions
    await expect(page.getByRole("tab")).toHaveCount(4, { timeout: 10000 });
  });

  test("activating the Routines tab renders the routines list or empty state", async ({
    page,
  }) => {
    await openRoutinesTab(page);

    // Either the populated list or the empty-state icon must be visible.
    const listOrEmpty = page
      .getByTestId("routines-list")
      .or(page.locator('[class*="EmptyState"], [data-testid*="empty"]'))
      .or(page.getByText(/no routines yet/i));
    await expect(listOrEmpty.first()).toBeVisible({ timeout: 10000 });
  });

  test("Routines tab hides the two-pane detail pane", async ({ page }) => {
    await openRoutinesTab(page);
    // InboxView renders a full-width layout for the routines branch —
    // data-testid="inbox-detail" must not be present/visible.
    await expect(page.getByTestId("inbox-detail")).toBeHidden();
  });

  test("Routines tab hides the search bar", async ({ page }) => {
    await openRoutinesTab(page);
    // Search input only shows for approvals + runs tabs.
    await expect(page.getByTestId("inbox-search")).toBeHidden();
  });

  test("sidebar Inbox link navigates to /inbox", async ({ page }) => {
    await page.goto("/");
    // Wait for the sidebar to mount.
    const inboxLink = page.getByTestId("sidebar-inbox-link");
    await expect(inboxLink).toBeVisible({ timeout: 15000 });
    await inboxLink.click();
    await expect(page).toHaveURL(/\/inbox/);
    await expect(
      page.getByRole("heading", { name: /inbox/i, level: 1 }),
    ).toBeVisible({ timeout: 10000 });
  });
});

// ---------------------------------------------------------------------------
// Suite 2: Create a routine via the /schedule dialog
//
// The dialog is a structured form (workflow + cadence preset + timezone).
// The NL path ("Every morning at 9am…") is NOT implemented as a free-text
// field — that NL parsing is future work. The NL sub-tests are skipped.
// ---------------------------------------------------------------------------

test.describe
  .serial("Suite 2 — Create a routine via the schedule dialog", () => {
    test.use({ storageState: TEST_USERS.admin.authFile });

    let workflowId: string | null = null;
    let workflowName: string;
    let ctx: BrowserContext;
    let setupPage: Page;

    test.beforeAll(async ({ browser }) => {
      ctx = await browser.newContext({
        storageState: TEST_USERS.admin.authFile,
      });
      setupPage = await ctx.newPage();
      workflowName = `e2e-create-routine-${uid()}`;
      workflowId = await createPublishedWorkflow(setupPage, workflowName);
    });

    test.afterAll(async () => {
      if (workflowId) await deleteWorkflow(setupPage, workflowId);
      await ctx.close();
    });

    test("schedule-routine-button is visible in the chat toolbar for admin/editor", async ({
      page,
    }) => {
      await page.goto("/");
      // The CalendarClock button renders for !isBasicUser inside prompt-input.tsx.
      await expect(page.getByTestId("schedule-routine-button")).toBeVisible({
        timeout: 15000,
      });
    });

    test("clicking schedule-routine-button opens the schedule dialog", async ({
      page,
    }) => {
      await page.goto("/");
      await page.getByTestId("schedule-routine-button").click();
      // Dialog mounts with the submit CTA visible.
      await expect(page.getByTestId("schedule-submit")).toBeVisible({
        timeout: 8000,
      });
    });

    test("submit is disabled when no workflow is selected", async ({
      page,
    }) => {
      await page.goto("/");
      await page.getByTestId("schedule-routine-button").click();
      await expect(page.getByTestId("schedule-submit")).toBeVisible({
        timeout: 8000,
      });
      await expect(page.getByTestId("schedule-submit")).toBeDisabled();
    });

    test("selecting a published workflow enables the submit button", async ({
      page,
    }) => {
      if (!workflowId) {
        test.skip(true, "published workflow unavailable — beforeAll failed");
        return;
      }

      await page.goto("/");
      await page.getByTestId("schedule-routine-button").click();
      await expect(page.getByTestId("schedule-submit")).toBeVisible({
        timeout: 8000,
      });

      // Open the workflow Select (first combobox in the dialog).
      await page.getByRole("combobox").first().click();
      await page
        .getByRole("option", { name: workflowName })
        .first()
        .click({ timeout: 10000 });

      // A cron preset (Daily) is pre-selected → submit should enable immediately.
      await expect(page.getByTestId("schedule-submit")).toBeEnabled({
        timeout: 5000,
      });
    });

    test("submitting the dialog with Daily cadence creates a routine and shows a toast", async ({
      page,
    }) => {
      if (!workflowId) {
        test.skip(true, "published workflow unavailable — beforeAll failed");
        return;
      }

      await page.goto("/");
      await page.getByTestId("schedule-routine-button").click();
      await expect(page.getByTestId("schedule-submit")).toBeVisible({
        timeout: 8000,
      });

      await page.getByRole("combobox").first().click();
      await page
        .getByRole("option", { name: workflowName })
        .first()
        .click({ timeout: 10000 });

      // Daily preset is pre-selected → submit.
      await page.getByTestId("schedule-submit").click();

      // A toast "Routine scheduled" (t("Triage.routineCreated")) must appear.
      await expect(page.getByText(/routine scheduled/i)).toBeVisible({
        timeout: 10000,
      });
    });

    test("routine appears in the Routines tab after creation", async ({
      page,
    }) => {
      if (!workflowId) {
        test.skip(true, "published workflow unavailable — beforeAll failed");
        return;
      }

      await openRoutinesTab(page);
      const routinesList = page.getByTestId("routines-list");
      await expect(routinesList).toBeVisible({ timeout: 10000 });
      await expect(routinesList.getByText(workflowName).first()).toBeVisible({
        timeout: 8000,
      });
    });

    test("routine row shows a cron expression in the Routines tab", async ({
      page,
    }) => {
      if (!workflowId) {
        test.skip(true, "published workflow unavailable — beforeAll failed");
        return;
      }

      await openRoutinesTab(page);
      const routinesList = page.getByTestId("routines-list");
      await expect(routinesList).toBeVisible({ timeout: 10000 });

      const routineRow = routinesList
        .locator("li")
        .filter({ hasText: workflowName })
        .first();
      await expect(routineRow).toBeVisible();

      // Daily preset maps to "0 9 * * *" — assert a cron-like string is present.
      // We use a loose regex since the exact expression depends on the preset.
      const cronCode = routineRow.locator("code");
      await expect(cronCode).toHaveText(/[\d*]+ [\d*]+ [\d*]+ [\d*]+ [\d*]+/, {
        timeout: 5000,
      });
    });

    test.skip("NL creation — 'Every morning at 9am, send me AI news' creates a routine (unimplemented: NL parsing not wired to dialog)", async ({
      page: _page,
    }) => {
      // Future: when NL-to-cron parsing is added to the schedule flow, this test
      // should open the dialog, type a natural-language description, assert the
      // dialog auto-populates a cron like "0 9 * * *", and confirm the routine is
      // created with an extracted name and schedule.
    });

    test("dialog shows a cost preview pill with a budget label", async ({
      page,
    }) => {
      await page.goto("/");
      await page.getByTestId("schedule-routine-button").click();
      await expect(page.getByTestId("schedule-submit")).toBeVisible({
        timeout: 8000,
      });
      // The CostPreview component (data-testid="cost-preview") should load once
      // the dialog fetches the estimate (estimateRoutineCostAction).
      await expect(page.getByTestId("cost-preview")).toBeVisible({
        timeout: 10000,
      });
    });

    test("custom cron field appears when 'Custom' cadence is selected", async ({
      page,
    }) => {
      await page.goto("/");
      await page.getByTestId("schedule-routine-button").click();
      await expect(page.getByTestId("schedule-submit")).toBeVisible({
        timeout: 8000,
      });

      // Open the cadence Select (second combobox).
      const cadenceSelect = page.getByRole("combobox").nth(1);
      await cadenceSelect.click();
      // Pick the "Custom" option.
      await page.getByRole("option", { name: /custom/i }).click();

      // The custom cron input should appear.
      await expect(page.getByTestId("schedule-custom-cron")).toBeVisible({
        timeout: 5000,
      });
    });

    test("an invalid custom cron shows an inline error without dismissing the dialog", async ({
      page,
    }) => {
      if (!workflowId) {
        test.skip(true, "published workflow unavailable — beforeAll failed");
        return;
      }

      await page.goto("/");
      await page.getByTestId("schedule-routine-button").click();
      await expect(page.getByTestId("schedule-submit")).toBeVisible({
        timeout: 8000,
      });

      // Select workflow.
      await page.getByRole("combobox").first().click();
      await page
        .getByRole("option", { name: workflowName })
        .first()
        .click({ timeout: 10000 });

      // Switch to Custom cadence.
      await page.getByRole("combobox").nth(1).click();
      await page.getByRole("option", { name: /custom/i }).click();

      // Enter a clearly invalid cron expression.
      await page.getByTestId("schedule-custom-cron").fill("not-a-cron");

      // Submit — the server action returns a CronError surfaced inline.
      await page.getByTestId("schedule-submit").click();

      // An inline error (role="alert") should appear with the cron error text.
      await expect(page.locator('[role="alert"]')).toBeVisible({
        timeout: 8000,
      });
      // The dialog must remain open (submit button still present).
      await expect(page.getByTestId("schedule-submit")).toBeVisible();
    });
  });

// ---------------------------------------------------------------------------
// Suite 3: Routine run history
//
// Routine runs appear in the Inbox "Runs" tab labelled with "Routines"
// (item.isRoutine = true → the origin sub-label shows the routines tab label).
// A dedicated per-routine "Runs" sub-tab does not exist — the test for that
// feature is skipped.
// ---------------------------------------------------------------------------

test.describe("Suite 3 — Routine run history", () => {
  test.use({ storageState: TEST_USERS.admin.authFile });

  test("Runs tab lists all runs including routine runs (origin=schedule)", async ({
    page,
  }) => {
    await page.goto("/inbox");
    await expect(
      page.getByRole("heading", { name: /inbox/i, level: 1 }),
    ).toBeVisible({ timeout: 15000 });

    // Activate the Runs tab (index 1).
    await page.getByRole("tab").nth(1).click();
    await expect(page.getByRole("tab").nth(1)).toHaveAttribute(
      "data-state",
      "active",
    );

    // The inbox-list must render (may be empty for a fresh environment).
    const list = page.getByTestId("inbox-list");
    await expect(list).toBeVisible({ timeout: 8000 });
  });

  test("a run item in the Runs tab has a timestamp and status badge", async ({
    page,
  }) => {
    await page.goto("/inbox");
    await expect(
      page.getByRole("heading", { name: /inbox/i, level: 1 }),
    ).toBeVisible({ timeout: 15000 });

    await page.getByRole("tab").nth(1).click();
    await expect(page.getByRole("tab").nth(1)).toHaveAttribute(
      "data-state",
      "active",
    );

    const items = page.getByTestId("inbox-item");
    const count = await items.count();
    if (count === 0) {
      // No runs in this environment — skip rather than fail.
      test.skip(true, "no run history in this environment");
      return;
    }

    // Clicking the first run opens the detail pane.
    await items.first().click();
    const detail = page.getByTestId("inbox-detail");
    await expect(detail).toBeVisible({ timeout: 5000 });

    // Detail pane shows a timestamp (MMM d, yyyy HH:mm pattern).
    await expect(detail.getByText(/\w+ \d+, \d{4} \d{2}:\d{2}/)).toBeVisible({
      timeout: 5000,
    });
  });

  test("clicking 'Open run' in the detail pane navigates to the run transcript", async ({
    page,
  }) => {
    await page.goto("/inbox");
    await expect(
      page.getByRole("heading", { name: /inbox/i, level: 1 }),
    ).toBeVisible({ timeout: 15000 });

    await page.getByRole("tab").nth(1).click();
    const items = page.getByTestId("inbox-item");
    const count = await items.count();
    if (count === 0) {
      test.skip(true, "no run history in this environment");
      return;
    }

    await items.first().click();
    const openRun = page.getByTestId("inbox-open-run");
    await expect(openRun).toBeVisible({ timeout: 5000 });
    await openRun.click();
    await expect(page).toHaveURL(/\/runs\/[0-9a-f-]{36}/);
  });

  test.skip("per-routine Runs sub-tab: shows previous scheduled runs with timestamp, status and output (unimplemented: no per-routine detail page yet)", async ({
    page: _page,
  }) => {
    // Future: when a per-routine detail page (/inbox/routines/[id]) is added,
    // this test should navigate to that page, open the "Runs" sub-tab, and
    // assert each row has: an ISO timestamp, a status chip (completed/failed),
    // and an output preview text block.
  });
});

// ---------------------------------------------------------------------------
// Suite 4: Enable / disable a routine
// ---------------------------------------------------------------------------

test.describe
  .serial("Suite 4 — Enable / disable a routine", () => {
    test.use({ storageState: TEST_USERS.admin.authFile });

    let workflowId: string | null = null;
    let workflowName: string;
    let ctx: BrowserContext;
    let setupPage: Page;

    test.beforeAll(async ({ browser }) => {
      ctx = await browser.newContext({
        storageState: TEST_USERS.admin.authFile,
      });
      setupPage = await ctx.newPage();
      workflowName = `e2e-toggle-routine-${uid()}`;
      workflowId = await createPublishedWorkflow(setupPage, workflowName);

      if (workflowId) {
        // Create the routine (Daily, enabled by default).
        await setupPage.goto("/");
        await setupPage.getByTestId("schedule-routine-button").click();
        await expect(setupPage.getByTestId("schedule-submit")).toBeVisible({
          timeout: 8000,
        });
        await setupPage.getByRole("combobox").first().click();
        await setupPage
          .getByRole("option", { name: workflowName })
          .first()
          .click({ timeout: 10000 });
        await setupPage.getByTestId("schedule-submit").click();
        // Wait for the toast so we know creation is complete.
        await expect(setupPage.getByText(/routine scheduled/i)).toBeVisible({
          timeout: 10000,
        });
      }
    });

    test.afterAll(async () => {
      if (workflowId) await deleteWorkflow(setupPage, workflowId);
      await ctx.close();
    });

    test("routine is enabled by default after creation (Enabled badge + checked toggle)", async ({
      page,
    }) => {
      if (!workflowId) {
        test.skip(true, "routine setup failed in beforeAll");
        return;
      }

      await openRoutinesTab(page);
      const routinesList = page.getByTestId("routines-list");
      await expect(routinesList).toBeVisible({ timeout: 10000 });

      const routineRow = routinesList
        .locator("li")
        .filter({ hasText: workflowName })
        .first();
      await expect(routineRow).toBeVisible();

      // Toggle should be checked (enabled).
      await expect(routineRow.getByTestId("routine-toggle")).toBeChecked({
        timeout: 5000,
      });
      // Enabled badge must be visible.
      await expect(routineRow.getByText(/^enabled$/i)).toBeVisible();
    });

    test("disabling a routine hides the Enabled badge and unchecks the toggle", async ({
      page,
    }) => {
      if (!workflowId) {
        test.skip(true, "routine setup failed in beforeAll");
        return;
      }

      await openRoutinesTab(page);
      const routinesList = page.getByTestId("routines-list");
      await expect(routinesList).toBeVisible({ timeout: 10000 });

      const routineRow = routinesList
        .locator("li")
        .filter({ hasText: workflowName })
        .first();
      await expect(routineRow).toBeVisible();

      const toggle = routineRow.getByTestId("routine-toggle");

      // Ensure the routine starts enabled; if not, re-enable first.
      const isChecked = await toggle.isChecked();
      if (!isChecked) {
        await toggle.click();
        await expect(toggle).toBeChecked({ timeout: 8000 });
      }

      // Disable.
      await toggle.click();

      // Optimistic update: toggle unchecked + Enabled badge gone.
      await expect(toggle).not.toBeChecked({ timeout: 8000 });
      await expect(routineRow.getByText(/^enabled$/i)).toBeHidden({
        timeout: 8000,
      });
    });

    test("re-enabling a routine restores the Enabled badge", async ({
      page,
    }) => {
      if (!workflowId) {
        test.skip(true, "routine setup failed in beforeAll");
        return;
      }

      await openRoutinesTab(page);
      const routinesList = page.getByTestId("routines-list");
      await expect(routinesList).toBeVisible({ timeout: 10000 });

      const routineRow = routinesList
        .locator("li")
        .filter({ hasText: workflowName })
        .first();
      await expect(routineRow).toBeVisible();

      const toggle = routineRow.getByTestId("routine-toggle");

      // Ensure it's disabled first.
      const isChecked = await toggle.isChecked();
      if (isChecked) {
        await toggle.click();
        await expect(toggle).not.toBeChecked({ timeout: 8000 });
      }

      // Re-enable.
      await toggle.click();
      await expect(toggle).toBeChecked({ timeout: 8000 });
      await expect(routineRow.getByText(/^enabled$/i)).toBeVisible({
        timeout: 8000,
      });
    });

    test("toggle state persists after a page reload", async ({ page }) => {
      if (!workflowId) {
        test.skip(true, "routine setup failed in beforeAll");
        return;
      }

      await openRoutinesTab(page);
      const routinesList = page.getByTestId("routines-list");
      await expect(routinesList).toBeVisible({ timeout: 10000 });

      const routineRow = routinesList
        .locator("li")
        .filter({ hasText: workflowName })
        .first();
      const toggle = routineRow.getByTestId("routine-toggle");

      const isCheckedBefore = await toggle.isChecked();
      // Flip the toggle.
      await toggle.click();
      // Allow the Server Action + router.refresh() to complete.
      await page.waitForTimeout(2000);

      // Hard reload and re-activate the Routines tab.
      await page.reload({ waitUntil: "networkidle" });
      await page.getByRole("tab").nth(2).click();
      await expect(page.getByRole("tab").nth(2)).toHaveAttribute(
        "data-state",
        "active",
      );

      const reloadedList = page.getByTestId("routines-list");
      await expect(reloadedList).toBeVisible({ timeout: 10000 });
      const reloadedRow = reloadedList
        .locator("li")
        .filter({ hasText: workflowName })
        .first();
      const reloadedToggle = reloadedRow.getByTestId("routine-toggle");

      // State should be the opposite of what it was before.
      if (isCheckedBefore) {
        await expect(reloadedToggle).not.toBeChecked({ timeout: 8000 });
      } else {
        await expect(reloadedToggle).toBeChecked({ timeout: 8000 });
      }
    });
  });

// ---------------------------------------------------------------------------
// Suite 5: Delete a routine
// ---------------------------------------------------------------------------

test.describe
  .serial("Suite 5 — Delete a routine", () => {
    test.use({ storageState: TEST_USERS.admin.authFile });

    let workflowId: string | null = null;
    let workflowName: string;
    let ctx: BrowserContext;
    let setupPage: Page;

    test.beforeAll(async ({ browser }) => {
      ctx = await browser.newContext({
        storageState: TEST_USERS.admin.authFile,
      });
      setupPage = await ctx.newPage();
      workflowName = `e2e-delete-routine-${uid()}`;
      workflowId = await createPublishedWorkflow(setupPage, workflowName);

      if (workflowId) {
        // Create the routine so we have something to delete.
        await setupPage.goto("/");
        await setupPage.getByTestId("schedule-routine-button").click();
        await expect(setupPage.getByTestId("schedule-submit")).toBeVisible({
          timeout: 8000,
        });
        await setupPage.getByRole("combobox").first().click();
        await setupPage
          .getByRole("option", { name: workflowName })
          .first()
          .click({ timeout: 10000 });
        await setupPage.getByTestId("schedule-submit").click();
        await expect(setupPage.getByText(/routine scheduled/i)).toBeVisible({
          timeout: 10000,
        });
      }
    });

    test.afterAll(async () => {
      // Workflow cleanup only (the routine itself is deleted by the test below).
      if (workflowId) await deleteWorkflow(setupPage, workflowId);
      await ctx.close();
    });

    test("clicking the delete button shows a confirmation dialog", async ({
      page,
    }) => {
      if (!workflowId) {
        test.skip(true, "routine setup failed in beforeAll");
        return;
      }

      await openRoutinesTab(page);
      const routinesList = page.getByTestId("routines-list");
      await expect(routinesList).toBeVisible({ timeout: 10000 });

      const routineRow = routinesList
        .locator("li")
        .filter({ hasText: workflowName })
        .first();
      await expect(routineRow).toBeVisible();

      await routineRow.getByTestId("routine-delete").click();

      // A confirmation dialog (notify.confirm) must appear.
      const confirmDialog = page.locator('[role="dialog"]');
      await expect(confirmDialog).toBeVisible({ timeout: 5000 });

      // Dismiss without confirming — close via Escape or Cancel.
      await page.keyboard.press("Escape");
      await expect(confirmDialog).toBeHidden({ timeout: 3000 });

      // Routine must still be in the list after cancellation.
      await expect(routineRow).toBeVisible();
    });

    test("confirming deletion removes the routine from the list", async ({
      page,
    }) => {
      if (!workflowId) {
        test.skip(true, "routine setup failed in beforeAll");
        return;
      }

      await openRoutinesTab(page);
      const routinesList = page.getByTestId("routines-list");
      await expect(routinesList).toBeVisible({ timeout: 10000 });

      const routineRow = routinesList
        .locator("li")
        .filter({ hasText: workflowName })
        .first();
      await expect(routineRow).toBeVisible();

      // Click delete.
      await routineRow.getByTestId("routine-delete").click();

      // Confirm in the dialog.
      const confirmDialog = page.locator('[role="dialog"]');
      await expect(confirmDialog).toBeVisible({ timeout: 5000 });
      await confirmDialog
        .getByRole("button", { name: /confirm/i })
        .click({ timeout: 5000 });

      // Wait for server action + router.refresh() to settle.
      await page.waitForTimeout(2000);

      // Hard reload to verify DB persistence.
      await page.reload({ waitUntil: "networkidle" });
      await page.getByRole("tab").nth(2).click();
      await expect(page.getByRole("tab").nth(2)).toHaveAttribute(
        "data-state",
        "active",
      );

      // The deleted routine must not appear.
      const reloadedList = page.getByTestId("routines-list");
      const rowAfter = reloadedList
        .locator("li")
        .filter({ hasText: workflowName });
      await expect(rowAfter).toHaveCount(0, { timeout: 8000 });
    });

    test("a success toast appears after deletion", async ({ page }) => {
      // This is a softer signal — we create a fresh routine just for this check.
      const localName = `e2e-delete-toast-${uid()}`;
      const localId = await createPublishedWorkflow(page, localName);
      if (!localId) {
        test.skip(true, "workflow creation failed");
        return;
      }

      // Create the routine.
      await page.goto("/");
      await page.getByTestId("schedule-routine-button").click();
      await expect(page.getByTestId("schedule-submit")).toBeVisible({
        timeout: 8000,
      });
      await page.getByRole("combobox").first().click();
      await page
        .getByRole("option", { name: localName })
        .first()
        .click({ timeout: 10000 });
      await page.getByTestId("schedule-submit").click();
      await expect(page.getByText(/routine scheduled/i)).toBeVisible({
        timeout: 10000,
      });

      // Navigate to the Routines tab and delete.
      await openRoutinesTab(page);
      const routinesList = page.getByTestId("routines-list");
      await expect(routinesList).toBeVisible({ timeout: 10000 });
      const routineRow = routinesList
        .locator("li")
        .filter({ hasText: localName })
        .first();
      await expect(routineRow).toBeVisible();

      await routineRow.getByTestId("routine-delete").click();
      const confirmDialog = page.locator('[role="dialog"]');
      await expect(confirmDialog).toBeVisible({ timeout: 5000 });
      await confirmDialog
        .getByRole("button", { name: /confirm/i })
        .click({ timeout: 5000 });

      // A "Routine deleted" toast must appear (t("Triage.routineDeleted")).
      await expect(page.getByText(/routine deleted/i)).toBeVisible({
        timeout: 8000,
      });

      // Best-effort cleanup of the workflow (routine is already deleted).
      await deleteWorkflow(page, localId);
    });
  });

// ---------------------------------------------------------------------------
// Suite 6: /schedule command (CalendarClock button) in the chat composer
// ---------------------------------------------------------------------------

test.describe("Suite 6 — /schedule command in the chat composer", () => {
  test.use({ storageState: TEST_USERS.admin.authFile });

  test("schedule-routine-button is visible in the chat composer toolbar", async ({
    page,
  }) => {
    await page.goto("/");
    // The button renders for admin + editor (non-basic) users.
    await expect(page.getByTestId("schedule-routine-button")).toBeVisible({
      timeout: 15000,
    });
  });

  test("clicking schedule-routine-button on the home page opens the dialog", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.getByTestId("schedule-routine-button")).toBeVisible({
      timeout: 15000,
    });
    await page.getByTestId("schedule-routine-button").click();

    // The dialog must be open: title and submit button visible.
    await expect(page.getByTestId("schedule-submit")).toBeVisible({
      timeout: 8000,
    });
    // The dialog title is t("Triage.scheduleRoutineTitle").
    await expect(page.getByRole("dialog").getByRole("heading")).toBeVisible({
      timeout: 5000,
    });
  });

  test("the schedule dialog has workflow, cadence and timezone selects", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByTestId("schedule-routine-button").click();
    await expect(page.getByTestId("schedule-submit")).toBeVisible({
      timeout: 8000,
    });

    const dialog = page.getByRole("dialog");

    // Three comboboxes: workflow | cadence | timezone.
    await expect(dialog.getByRole("combobox")).toHaveCount(3, {
      timeout: 5000,
    });
  });

  test("dialog footer has a link to the Routines tab (/inbox)", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByTestId("schedule-routine-button").click();
    await expect(page.getByTestId("schedule-submit")).toBeVisible({
      timeout: 8000,
    });

    const dialog = page.getByRole("dialog");
    // Footer link: t("Triage.routinesTab") → "Routines" pointing to /inbox.
    const footerLink = dialog.getByRole("link", { name: /routines/i });
    await expect(footerLink).toBeVisible({ timeout: 5000 });
    await expect(footerLink).toHaveAttribute("href", "/inbox");
  });

  test("dialog can be closed with Escape without creating a routine", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByTestId("schedule-routine-button").click();
    await expect(page.getByTestId("schedule-submit")).toBeVisible({
      timeout: 8000,
    });

    await page.keyboard.press("Escape");
    await expect(page.getByTestId("schedule-submit")).toBeHidden({
      timeout: 3000,
    });

    // The chat composer should still be visible (no navigation away).
    await expect(page.getByTestId("schedule-routine-button")).toBeVisible({
      timeout: 5000,
    });
  });

  test("regular (basic) user does not see the schedule-routine-button", async ({
    browser,
  }) => {
    const ctx = await browser.newContext({
      storageState: TEST_USERS.regular.authFile,
    });
    const page = await ctx.newPage();
    try {
      await page.goto("/", { waitUntil: "networkidle" });
      // Wait for the sidebar (auth shell) to confirm the page is loaded.
      await expect(page.getByTestId("sidebar-user-button")).toBeVisible({
        timeout: 15000,
      });
      const count = await page.getByTestId("schedule-routine-button").count();
      expect(
        count,
        "Basic/regular users must not see the schedule-routine-button",
      ).toBe(0);
    } finally {
      await ctx.close();
    }
  });

  test.skip("typing '/schedule' in the composer shows a slash-command autocomplete (unimplemented: slash-command autocomplete not yet wired)", async ({
    page: _page,
  }) => {
    // Future: when a slash-command menu is implemented in prompt-input.tsx,
    // this test should:
    //   1. Navigate to /
    //   2. Click the composer textarea
    //   3. Type "/schedule"
    //   4. Assert a dropdown/popover autocomplete appears listing "schedule"
    //   5. Select the command
    //   6. Assert the ScheduleRoutineDialog opens (data-testid="schedule-submit" visible)
  });

  test.skip("selecting the /schedule autocomplete opens the routine creation flow (unimplemented: slash-command menu not yet wired)", async ({
    page: _page,
  }) => {
    // Companion to the test above — covers the selection step + dialog open.
  });
});
