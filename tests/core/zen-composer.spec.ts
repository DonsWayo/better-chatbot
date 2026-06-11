import { expect, test } from "@playwright/test";
import { TEST_USERS } from "../constants/test-users";
import { suppressOnboardingOverlays } from "../helpers/session-prep";

// Zen composer (src/components/prompt-input.tsx): anyone whose role is not
// admin/editor is a "basic user" (fail closed) and gets the stripped-down
// composer — no model selector (data-testid="model-selector-button"), no
// tool-mode/Tools dropdowns, and the "+" menu offers a single flat
// "Generate Image" item instead of the Gemini/OpenAI provider submenu.
// The "+" trigger (data-testid="composer-plus-button") is disabled until a
// threadId exists; the home page ("/") always mounts ChatBot with a fresh
// thread id (src/app/(chat)/page.tsx), so it is enabled there.
// Labels from messages/en.json: Chat.addFiles = "Add files",
// Chat.generateImage = "Generate Image", Chat.tools = "Tools".

test.describe("Composer role gating (zen vs full)", () => {
  test("regular user gets the zen composer: no model selector, no Tools, flat Generate Image", async ({
    browser,
  }) => {
    const ctx = await browser.newContext({
      storageState: TEST_USERS.regular.authFile,
    });
    try {
      const page = await ctx.newPage();
      await suppressOnboardingOverlays(page);
      await page.goto("/");

      // Wait until the authenticated shell + composer are mounted before
      // asserting absences.
      await expect(page.getByTestId("sidebar-user-button")).toBeVisible({
        timeout: 15000,
      });
      const composer = page.locator("fieldset");
      const plusButton = composer.getByTestId("composer-plus-button");
      await expect(plusButton).toBeEnabled({ timeout: 15000 });

      await expect(composer.getByTestId("model-selector-button")).toHaveCount(
        0,
      );
      await expect(composer.getByRole("button", { name: /Tools/ })).toHaveCount(
        0,
      );

      // "+" menu: exactly Add files + a flat Generate Image item (no
      // provider submenu for basic users).
      await plusButton.click();
      const menu = page.getByRole("menu");
      await expect(menu).toBeVisible({ timeout: 10000 });
      await expect(menu.getByRole("menuitem")).toHaveCount(2);
      await expect(
        menu.getByRole("menuitem", { name: "Add files" }),
      ).toBeVisible();
      const generateImage = menu.getByRole("menuitem", {
        name: "Generate Image",
      });
      await expect(generateImage).toBeVisible();
      // A flat item, not a Radix submenu trigger.
      await expect(generateImage).not.toHaveAttribute("aria-haspopup", "menu");
    } finally {
      await ctx.close();
    }
  });

  test("editor keeps the full composer: model selector, Tools, provider submenu", async ({
    browser,
  }) => {
    const ctx = await browser.newContext({
      storageState: TEST_USERS.editor.authFile,
    });
    try {
      const page = await ctx.newPage();
      await suppressOnboardingOverlays(page);
      await page.goto("/");

      const composer = page.locator("fieldset");
      await expect(composer.getByTestId("model-selector-button")).toBeVisible({
        timeout: 15000,
      });
      await expect(
        composer.getByRole("button", { name: /Tools/ }),
      ).toBeVisible();

      // "+" menu: Generate Image is a submenu trigger with both providers.
      const plusButton = composer.getByTestId("composer-plus-button");
      await expect(plusButton).toBeEnabled({ timeout: 15000 });
      await plusButton.click();
      const generateImage = page.getByRole("menuitem", {
        name: "Generate Image",
      });
      await expect(generateImage).toBeVisible({ timeout: 10000 });
      await expect(generateImage).toHaveAttribute("aria-haspopup", "menu");

      await generateImage.hover();
      await expect(
        page.getByRole("menuitem", { name: "Gemini (Nano Banana)" }),
      ).toBeVisible({ timeout: 10000 });
      await expect(
        page.getByRole("menuitem", { name: "OpenAI", exact: true }),
      ).toBeVisible();
    } finally {
      await ctx.close();
    }
  });
});
