import { expect, test } from "@playwright/test";
import { TEST_USERS } from "../constants/test-users";
import { suppressOnboardingOverlays } from "../helpers/session-prep";

// ERP-style layered model entitlements — team override layer:
// src/components/admin/team-detail-client.tsx renders the "Model Allow-List"
// card (data-testid="model-allow-list-card") with one labelled checkbox per
// approved model (data-testid="model-checkbox-<id>") and a save button
// (data-testid="save-model-allow-list-btn"); persistence goes through
// setModelAllowListAction and is re-read server-side on reload.
//
// Teams are seeded through POST /api/admin/teams (same API the w9 spec uses;
// returns { team }). There is no REST DELETE for teams (deletion is a server
// action), so cleanup uses the page's own delete button + confirm dialog
// (data-testids delete-team-btn / confirm-delete-team-btn), which redirects
// to /admin/teams.

test.use({ storageState: TEST_USERS.admin.authFile });

const BUDGET_MODELS = [
  { id: "deepseek-v4-pro", label: "DeepSeek V4 Pro" },
  { id: "kimi-k2.5", label: "Kimi K2.5" },
  { id: "deepseek-v4-flash", label: "DeepSeek V4 Flash" },
] as const;

test.describe("Admin team model entitlements — budget models", () => {
  test("team detail offers the budget models and a granted one persists", async ({
    page,
  }) => {
    await suppressOnboardingOverlays(page);

    const teamName = `Budget Models Team ${Date.now()}`;
    const createRes = await page.request.post("/api/admin/teams", {
      headers: { "Content-Type": "application/json" },
      data: { name: teamName, description: "e2e budget model entitlements" },
    });
    expect(createRes.ok(), await createRes.text()).toBeTruthy();
    const { team } = (await createRes.json()) as { team: { id: string } };

    await page.goto(`/admin/teams/${team.id}`);
    const card = page.getByTestId("model-allow-list-card");
    await expect(card).toBeVisible({ timeout: 15000 });

    // All three budget models are offered in the multi-select.
    for (const model of BUDGET_MODELS) {
      await expect(
        card.getByTestId(`model-checkbox-${model.id}`),
      ).toContainText(model.label);
    }

    // Grant one budget model and save.
    const grantedModel = card
      .getByTestId("model-checkbox-deepseek-v4-pro")
      .locator('input[type="checkbox"]');
    await grantedModel.check();
    const [saveRes] = await Promise.all([
      page.waitForResponse(
        (res) =>
          res.url().includes("/api/admin/teams/") &&
          ["PUT", "PATCH", "POST"].includes(res.request().method()),
        { timeout: 10000 },
      ),
      card.getByTestId("save-model-allow-list-btn").click(),
    ]);
    expect(
      saveRes.ok(),
      `save failed: ${saveRes.status()} ${await saveRes.text()}`,
    ).toBeTruthy();
    await expect(card.getByText("Model list saved.")).toBeVisible({
      timeout: 10000,
    });

    // Reload: the page re-reads the allow-list server-side.
    await page.reload();
    await expect(page.getByTestId("model-allow-list-card")).toBeVisible({
      timeout: 15000,
    });
    await expect(
      page
        .getByTestId("model-checkbox-deepseek-v4-pro")
        .locator('input[type="checkbox"]'),
    ).toBeChecked();
    // A model that was not granted stays unchecked.
    await expect(
      page
        .getByTestId("model-checkbox-kimi-k2.5")
        .locator('input[type="checkbox"]'),
    ).not.toBeChecked();

    // Cleanup through the UI (team deletion is server-action only).
    await page.getByTestId("delete-team-btn").click();
    await page.getByTestId("confirm-delete-team-btn").click();
    await page.waitForURL(/\/admin\/teams\/?(\?.*)?$/, { timeout: 15000 });
  });
});
