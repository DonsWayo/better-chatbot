import { expect, test } from "@playwright/test";
import { TEST_USERS } from "../constants/test-users";

test.describe("Agent Access Spec", () => {
  test.use({ storageState: TEST_USERS.admin.authFile });

  test("should access agents page when authenticated", async ({ page }) => {
    // The agents gallery is now the Agents tab of Studio; /agents redirects
    // there (the redirect is kept so inbound links survive).
    await page.goto("/agents");
    await page.waitForLoadState("networkidle");

    expect(page.url()).toContain("/studio");

    // Should see the agents gallery content (rendered in the Studio Agents tab).
    await expect(page.getByTestId("agents-title")).toBeVisible();
  });

  test("should navigate to new agent page", async ({ page }) => {
    await page.goto("/agent/new");
    await page.waitForLoadState("networkidle");

    // Should be on the new agent page
    expect(page.url()).toContain("/agent/new");

    // Should see agent creation form
    await expect(page.getByTestId("agent-name-input")).toBeVisible();
  });

  test("should have sidebar with agent list", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Should have sidebar with agents section (links straight to Studio,
    // avoiding the /agents -> /studio redirect hop)
    const agentsLink = page.getByTestId("agents-link");
    await expect(agentsLink).toBeVisible();
    await expect(agentsLink).toHaveAttribute("href", "/studio");
  });
});
