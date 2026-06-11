import { type Browser, type Page, expect, test } from "@playwright/test";
import { TEST_USERS } from "../constants/test-users";

// Unified four-level visibility model (private / shared / team / company —
// src/components/visibility/* and docs/design/visibility-model.md):
// - `company` is admin-only and makes an agent visible org-wide.
// - `shared` works through per-user grants (entity_grant) added by email.
// - `private` stays owner-only.
// Agents are seeded via the API (fast + robust); only the grant-by-email flow,
// the actual behavior under test, drives the editor UI.

const testSuffix =
  Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const companyAgentName = `Company Agent ${testSuffix}`;
const privateAgentName = `Private Agent ${testSuffix}`;
const sharedAgentName = `Shared Agent ${testSuffix}`;

let sharedAgentId = "";

test.describe.configure({ mode: "serial" });

/** Create an agent via the API as a given seeded user; returns its id. */
async function createAgentAs(
  browser: Browser,
  authFile: string,
  body: { name: string; description: string; visibility: string },
): Promise<string> {
  const context = await browser.newContext({ storageState: authFile });
  try {
    const page = await context.newPage();
    const res = await page.request.post("/api/agent", {
      headers: { "Content-Type": "application/json" },
      // userId is required by AgentCreateSchema but the route overrides it with
      // the authenticated session user — any placeholder satisfies validation.
      data: {
        ...body,
        instructions: {},
        userId: "00000000-0000-0000-0000-000000000000",
      },
      timeout: 15000,
    });
    if (!res.ok()) {
      throw new Error(
        `Failed to create agent ${body.name}: ${res.status()} ${await res.text()}`,
      );
    }
    const json = (await res.json()) as { id: string };
    return json.id;
  } finally {
    await context.close();
  }
}

test.describe("Agent visibility and sharing between users", () => {
  test.beforeAll(
    "seed agents at each visibility level",
    async ({ browser }) => {
      // company is admin-gated; private + shared owned by the editor.
      await createAgentAs(browser, TEST_USERS.admin.authFile, {
        name: companyAgentName,
        description: "Org-wide agent everyone in the company can use",
        visibility: "company",
      });
      await createAgentAs(browser, TEST_USERS.editor.authFile, {
        name: privateAgentName,
        description: "Private agent only the owner can see",
        visibility: "private",
      });
      sharedAgentId = await createAgentAs(browser, TEST_USERS.editor.authFile, {
        name: sharedAgentName,
        description: "Agent shared with one named person via grant",
        visibility: "shared",
      });

      // Grant the regular user access by email through the editor UI — this is
      // the behavior under test, so it runs through the real picker.
      const context = await browser.newContext({
        storageState: TEST_USERS.editor.authFile,
      });
      try {
        const page = await context.newPage();
        await page.goto(`/agent/${sharedAgentId}`);
        await page.waitForLoadState("networkidle");
        const sharedPanel = page.getByTestId("visibility-shared-panel");
        await expect(sharedPanel).toBeVisible({ timeout: 15000 });
        await page
          .getByTestId("visibility-grant-email")
          .fill(TEST_USERS.regular.email);
        await page.getByTestId("visibility-grant-add").click();
        await expect(sharedPanel).toContainText(TEST_USERS.regular.email, {
          timeout: 15000,
        });
      } finally {
        await context.close();
      }
    },
  );

  async function agentCard(page: Page, name: string) {
    return page.locator(`[data-testid="agent-card-name"]:has-text("${name}")`);
  }

  test("regular user sees the company agent but not the private one", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      storageState: TEST_USERS.regular.authFile,
    });
    try {
      const page = await context.newPage();
      await page.goto("/agents");
      await page.waitForLoadState("networkidle");

      await expect(await agentCard(page, companyAgentName)).toBeVisible({
        timeout: 10000,
      });
      await expect(await agentCard(page, privateAgentName)).not.toBeVisible();
    } finally {
      await context.close();
    }
  });

  test("regular user sees an agent shared with them by grant", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      storageState: TEST_USERS.regular.authFile,
    });
    try {
      const page = await context.newPage();
      await page.goto("/agents");
      await page.waitForLoadState("networkidle");

      await expect(await agentCard(page, sharedAgentName)).toBeVisible({
        timeout: 10000,
      });

      // And can open it (read access via the grant).
      await page.goto(`/agent/${sharedAgentId}`);
      await expect(page.getByTestId("agent-name-input")).toHaveValue(
        sharedAgentName,
        { timeout: 10000 },
      );
    } finally {
      await context.close();
    }
  });

  test("a user the agent was not shared with cannot see it", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      storageState: TEST_USERS.editor2.authFile,
    });
    try {
      const page = await context.newPage();
      await page.goto("/agents");
      await page.waitForLoadState("networkidle");

      await expect(await agentCard(page, sharedAgentName)).not.toBeVisible();
      await expect(await agentCard(page, privateAgentName)).not.toBeVisible();
    } finally {
      await context.close();
    }
  });

  test("non-admin cannot select company visibility", async ({ browser }) => {
    const context = await browser.newContext({
      storageState: TEST_USERS.editor.authFile,
    });
    try {
      const page = await context.newPage();
      await page.goto(`/agent/${sharedAgentId}`);
      await page.waitForLoadState("networkidle");
      await expect(page.getByTestId("visibility-level-company")).toBeDisabled();
    } finally {
      await context.close();
    }
  });
});
