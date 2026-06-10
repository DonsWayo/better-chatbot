import { expect, test } from "@playwright/test";
import { TEST_USERS } from "../constants/test-users";
import { clickAndWaitForNavigation } from "../utils/test-helpers";

// Unified four-level visibility model (private / shared / team / company —
// src/components/visibility/* and docs/design/visibility-model.md):
// - `company` is admin-only and makes an agent visible org-wide.
// - `shared` works through per-user grants (entity_grant) added by email.
// - `private` stays owner-only.
// The legacy dropdown tests were replaced 2026-06-10 when the
// `visibility-level-*` radio picker landed.

const testSuffix =
  Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const companyAgentName = `Company Agent ${testSuffix}`;
const privateAgentName = `Private Agent ${testSuffix}`;
const sharedAgentName = `Shared Agent ${testSuffix}`;

test.describe.configure({ mode: "serial" });

async function createAgent(
  page: import("@playwright/test").Page,
  name: string,
  description: string,
) {
  await page.goto("/agent/new");
  await page.waitForLoadState("networkidle");
  await page.getByTestId("agent-name-input").fill(name);
  await page.getByTestId("agent-description-input").fill(description);
  await clickAndWaitForNavigation(page, "agent-save-button", "**/studio");
}

/** Open an existing agent's edit page from the /agents list. */
async function openAgent(page: import("@playwright/test").Page, name: string) {
  await page.goto("/agents");
  await page.waitForLoadState("networkidle");
  await page.locator(`main a:has-text("${name}")`).first().click();
  await page.waitForURL("**/agent/**", { timeout: 10000 });
  await page.waitForLoadState("networkidle");
}

test.describe("Agent visibility and sharing between users", () => {
  test.beforeAll(
    "set up agents at each visibility level",
    async ({ browser }) => {
      // Admin: company-visible agent (company level is admin-gated).
      const adminContext = await browser.newContext({
        storageState: TEST_USERS.admin.authFile,
      });
      const adminPage = await adminContext.newPage();
      try {
        await createAgent(
          adminPage,
          companyAgentName,
          "Org-wide agent everyone in the company can use",
        );
        await openAgent(adminPage, companyAgentName);
        // Selecting a level on a saved agent persists immediately (PUT).
        await Promise.all([
          adminPage.waitForResponse(
            (res) =>
              res.url().includes("/api/agent/") &&
              res.request().method() === "PUT" &&
              res.ok(),
          ),
          adminPage.getByTestId("visibility-level-company").click(),
        ]);
      } finally {
        await adminContext.close();
      }

      // Editor: a private agent and a grant-shared agent.
      const editorContext = await browser.newContext({
        storageState: TEST_USERS.editor.authFile,
      });
      const editorPage = await editorContext.newPage();
      try {
        await createAgent(
          editorPage,
          privateAgentName,
          "Private agent only the owner can see",
        );

        await createAgent(
          editorPage,
          sharedAgentName,
          "Agent shared with one named person via grant",
        );
        await openAgent(editorPage, sharedAgentName);
        await Promise.all([
          editorPage.waitForResponse(
            (res) =>
              res.url().includes("/api/agent/") &&
              res.request().method() === "PUT" &&
              res.ok(),
          ),
          editorPage.getByTestId("visibility-level-shared").click(),
        ]);
        // Grant the regular user access by email.
        const sharedPanel = editorPage.getByTestId("visibility-shared-panel");
        await expect(sharedPanel).toBeVisible({ timeout: 10000 });
        await editorPage
          .getByTestId("visibility-grant-email")
          .fill(TEST_USERS.regular.email);
        await editorPage.getByTestId("visibility-grant-add").click();
        await expect(sharedPanel).toContainText(TEST_USERS.regular.email, {
          timeout: 10000,
        });
      } finally {
        await editorContext.close();
      }
    },
  );

  test("regular user sees the company agent but not the private one", async ({
    browser,
  }) => {
    const userContext = await browser.newContext({
      storageState: TEST_USERS.regular.authFile,
    });
    const userPage = await userContext.newPage();
    try {
      await userPage.goto("/agents");
      await userPage.waitForLoadState("networkidle");

      await expect(
        userPage.locator(
          `[data-testid="agent-card-name"]:has-text("${companyAgentName}")`,
        ),
      ).toBeVisible({ timeout: 10000 });

      await expect(
        userPage.locator(
          `[data-testid="agent-card-name"]:has-text("${privateAgentName}")`,
        ),
      ).not.toBeVisible();
    } finally {
      await userContext.close();
    }
  });

  test("regular user sees an agent shared with them by grant", async ({
    browser,
  }) => {
    const userContext = await browser.newContext({
      storageState: TEST_USERS.regular.authFile,
    });
    const userPage = await userContext.newPage();
    try {
      await userPage.goto("/agents");
      await userPage.waitForLoadState("networkidle");

      await expect(
        userPage.locator(
          `[data-testid="agent-card-name"]:has-text("${sharedAgentName}")`,
        ),
      ).toBeVisible({ timeout: 10000 });

      // And can open it (read access via the grant).
      await userPage
        .locator(`main a:has-text("${sharedAgentName}")`)
        .first()
        .click();
      await userPage.waitForURL("**/agent/**", { timeout: 10000 });
      await expect(userPage.getByTestId("agent-name-input")).toHaveValue(
        sharedAgentName,
        { timeout: 10000 },
      );
    } finally {
      await userContext.close();
    }
  });

  test("a user the agent was not shared with cannot see it", async ({
    browser,
  }) => {
    const otherContext = await browser.newContext({
      storageState: TEST_USERS.editor2.authFile,
    });
    const otherPage = await otherContext.newPage();
    try {
      await otherPage.goto("/agents");
      await otherPage.waitForLoadState("networkidle");

      await expect(
        otherPage.locator(
          `[data-testid="agent-card-name"]:has-text("${sharedAgentName}")`,
        ),
      ).not.toBeVisible();
      await expect(
        otherPage.locator(
          `[data-testid="agent-card-name"]:has-text("${privateAgentName}")`,
        ),
      ).not.toBeVisible();
    } finally {
      await otherContext.close();
    }
  });

  test("non-admin cannot select company visibility", async ({ browser }) => {
    const editorContext = await browser.newContext({
      storageState: TEST_USERS.editor.authFile,
    });
    const editorPage = await editorContext.newPage();
    try {
      await openAgent(editorPage, sharedAgentName);
      await expect(
        editorPage.getByTestId("visibility-level-company"),
      ).toBeDisabled();
    } finally {
      await editorContext.close();
    }
  });
});
