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
        // The picker lives in a popover behind the owner-only visibility button.
        await page.getByTestId("agent-visibility-button").click();
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

  // The agent gallery moved into the builder-gated Studio (the /agents route
  // now redirects there), so regular users no longer browse a gallery. The
  // visibility model is surfaced for everyone through GET /api/agent — the same
  // endpoint the UI lists from — so assert against it directly.
  async function listVisibleAgentNames(page: Page): Promise<string[]> {
    const res = await page.request.get("/api/agent?filters=all", {
      timeout: 15000,
    });
    if (!res.ok()) {
      throw new Error(`GET /api/agent failed: ${res.status()}`);
    }
    const agents = (await res.json()) as Array<{ name: string }>;
    return agents.map((a) => a.name);
  }

  test("regular user sees the company agent but not the private one", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      storageState: TEST_USERS.regular.authFile,
    });
    try {
      const page = await context.newPage();
      const names = await listVisibleAgentNames(page);
      expect(names).toContain(companyAgentName);
      expect(names).not.toContain(privateAgentName);
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
      const names = await listVisibleAgentNames(page);
      expect(names).toContain(sharedAgentName);

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
      const names = await listVisibleAgentNames(page);
      expect(names).not.toContain(sharedAgentName);
      expect(names).not.toContain(privateAgentName);
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
      await page.getByTestId("agent-visibility-button").click();
      await expect(page.getByTestId("visibility-level-company")).toBeDisabled();
    } finally {
      await context.close();
    }
  });
});
