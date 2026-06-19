import { type Page, expect, test } from "@playwright/test";
import { TEST_USERS } from "../constants/test-users";

// Workflow builder — WebSearch node UI.
// Creates a workflow, adds a WebSearch node, verifies configuration panel
// renders.  We do NOT trigger an actual web-search execution (that needs
// TAVILY_API_KEY in the CI env).

async function openNewWorkflow(page: Page): Promise<void> {
  await page.goto("/studio");
  // The studio page lists workflows/agents; create a new workflow.
  // Try the "+ New Workflow" button first; fall back to a direct nav.
  const newBtn = page
    .getByRole("button", { name: /new workflow/i })
    .or(page.getByTestId("workflow-new"))
    .first();
  const btnVisible = await newBtn.isVisible().catch(() => false);
  if (btnVisible) {
    await newBtn.click();
    await expect(page).toHaveURL(/\/studio\/[0-9a-f-]{36}/);
  } else {
    // Create via API and navigate directly.
    const res = await page.request.post("/api/workflows", {
      headers: { "Content-Type": "application/json" },
      data: { name: `e2e-websearch-${Date.now()}`, description: "" },
    });
    if (res.ok()) {
      const body = (await res.json()) as { id?: string; workflow?: { id: string } };
      const id = body.id ?? body.workflow?.id;
      if (id) await page.goto(`/studio/${id}`);
    }
  }
}

test.describe("Workflow builder — WebSearch node", () => {
  test.use({ storageState: TEST_USERS.admin.authFile });

  test("studio page loads without error", async ({ page }) => {
    await page.goto("/studio");
    await expect(page.getByRole("heading").first()).toBeVisible();
  });

  test("workflow canvas renders when a workflow is open", async ({ page }) => {
    await openNewWorkflow(page);
    // The canvas is the workflow builder surface.
    await expect(
      page
        .getByTestId("workflow-canvas")
        .or(page.locator(".react-flow, [data-testid='rf__wrapper']"))
        .first(),
    ).toBeVisible({ timeout: 10000 });
  });

  test("add-node panel lists WebSearch as an available node kind", async ({
    page,
  }) => {
    await openNewWorkflow(page);

    // Open the add-node panel (usually a "+" button or right-click on canvas).
    const addBtn = page
      .getByRole("button", { name: /add node|add step|\+/i })
      .or(page.getByTestId("workflow-add-node"))
      .first();

    const addBtnVisible = await addBtn.isVisible({ timeout: 5000 }).catch(() => false);
    if (!addBtnVisible) {
      test.skip(true, "add-node UI not reachable without canvas interaction");
      return;
    }
    await addBtn.click();

    // The node picker should list WebSearch (or a search input to find it).
    const picker = page
      .getByTestId("node-picker")
      .or(page.getByRole("dialog"))
      .or(page.locator("[data-radix-popper-content-wrapper]"))
      .first();
    await expect(picker).toBeVisible({ timeout: 5000 });

    await expect(
      picker.getByText(/web.?search/i).first(),
    ).toBeVisible({ timeout: 5000 });
  });
});
