import { randomUUID } from "node:crypto";
import { type Page, expect, test } from "@playwright/test";
import { TEST_USERS } from "../constants/test-users";
import {
  getPreferences,
  putPreferences,
  signInViaApi,
  suppressOnboardingOverlays,
} from "../helpers/session-prep";

// User memory (docs/design/user-memory.md):
// - UI: src/components/memory/memory-manager.tsx on /settings/personalization.
//   Tri-state buttons On / Paused / Off in a section headed "Memory"
//   (messages/en.json Memory.*); per-item delete is the button with
//   title="Delete memory"; turning Off confirms via notify.confirm
//   (src/lib/notify.tsx — ghost "Cancel" + secondary "Confirm").
// - Read API: GET /api/memory -> { policy, mode, memories } (route.ts).
// - Writes happen only through Server Actions (actions.ts), so the seed path
//   is the real one: an explicit "remember ..." chat turn triggers
//   runPostTurnMemoryExtraction (lib/memory/extract.ts) on the OpenRouter
//   extraction model. That makes seeding LLM-dependent — guarded with
//   test.skip(!process.env.OPENROUTER_API_KEY) and generous timeouts. No
//   assertions are made on model output content, only on list/persistence.
//
// Uses a dedicated seeded user (testuser15, role "user") so the shared
// regular user's memories/preferences are never mutated.

// testUsers[11] => testuser15@test-seed.local, role "user".
const MEMORY_USER = TEST_USERS.testUsers[11];

interface MemoryStateResponse {
  mode: "on" | "paused" | "off";
  memories: Array<{ id: string; content: string }>;
}

async function getMemoryState(page: Page): Promise<MemoryStateResponse> {
  const res = await page.request.get("/api/memory");
  expect(res.ok(), "GET /api/memory").toBeTruthy();
  return (await res.json()) as MemoryStateResponse;
}

async function setMemoryModeOn(page: Page): Promise<void> {
  const prefs = await getPreferences(page);
  await putPreferences(page, { ...prefs, memoryMode: "on" });
}

/** The Settings → Personalization card that hosts the memory manager. */
function memorySection(page: Page) {
  return page.locator("section").filter({
    has: page.getByRole("heading", { name: "Memory", exact: true }),
  });
}

test.describe.configure({ mode: "serial" });

test.describe("Memory manager (Settings → Personalization)", () => {
  test.beforeEach(async ({ page }) => {
    await signInViaApi(page, MEMORY_USER);
    await suppressOnboardingOverlays(page);
  });

  test.afterAll("restore memory mode for reruns", async ({ browser }) => {
    const ctx = await browser.newContext();
    try {
      const page = await ctx.newPage();
      await signInViaApi(page, MEMORY_USER);
      const prefs = await getPreferences(page);
      await putPreferences(page, { ...prefs, memoryMode: "on" });
    } finally {
      await ctx.close();
    }
  });

  test("memory card renders with the tri-state control", async ({ page }) => {
    await setMemoryModeOn(page);
    await page.goto("/settings/personalization");

    const section = memorySection(page);
    await expect(
      section.getByRole("heading", { name: "Memory", exact: true }),
    ).toBeVisible({ timeout: 15000 });

    for (const mode of ["On", "Paused", "Off"]) {
      await expect(
        section.getByRole("button", { name: mode, exact: true }),
      ).toBeVisible();
    }
    // Mode is "on" → its helper copy is shown (memory-manager.tsx).
    await expect(
      section.getByText(
        "New memories are saved and used to personalize responses.",
      ),
    ).toBeVisible();
  });

  test("an explicit remember request in chat appears in the memory list", async ({
    page,
  }) => {
    test.skip(
      !process.env.OPENROUTER_API_KEY,
      "memory extraction needs the real OpenRouter key",
    );
    // Real-LLM step: one chat turn + post-turn extraction.
    test.setTimeout(180_000);

    await setMemoryModeOn(page);

    const chatRes = await page.request.post("/api/chat", {
      headers: { "Content-Type": "application/json" },
      data: {
        id: randomUUID(),
        message: {
          id: randomUUID(),
          role: "user",
          parts: [
            {
              type: "text",
              text: "Remember that I am the e2e memory test owner and that my favourite colour is teal.",
            },
          ],
        },
        toolChoice: "none",
      },
      timeout: 120_000,
    });
    expect(chatRes.status(), await chatRes.text().catch(() => "")).toBe(200);

    // Extraction is fire-and-forget after the stream finishes — poll the
    // read API until at least one memory lands.
    await expect
      .poll(async () => (await getMemoryState(page)).memories.length, {
        timeout: 45_000,
        message: "post-turn extraction should store at least one memory",
      })
      .toBeGreaterThan(0);

    // And the manager surfaces it (a row with its delete affordance).
    await page.goto("/settings/personalization");
    await expect(
      memorySection(page).locator('button[title="Delete memory"]').first(),
    ).toBeVisible({ timeout: 15000 });
  });

  test("per-item delete removes the memory from the list", async ({ page }) => {
    test.skip(
      !process.env.OPENROUTER_API_KEY,
      "depends on the LLM-seeded memory from the previous test",
    );
    await setMemoryModeOn(page);

    const before = await getMemoryState(page);
    test.skip(
      before.memories.length === 0,
      "no memories to delete (seed step stored none)",
    );

    await page.goto("/settings/personalization");
    const deleteButtons = memorySection(page).locator(
      'button[title="Delete memory"]',
    );
    await expect(deleteButtons.first()).toBeVisible({ timeout: 15000 });
    await deleteButtons.first().click();

    await expect
      .poll(async () => (await getMemoryState(page)).memories.length, {
        timeout: 15_000,
        message: "deleting one memory should shrink the list by one",
      })
      .toBe(before.memories.length - 1);
  });

  test("switching the mode to Off confirms, wipes all memories and persists", async ({
    page,
  }) => {
    await setMemoryModeOn(page);
    await page.goto("/settings/personalization");

    const section = memorySection(page);
    await expect(
      section.getByRole("button", { name: "Off", exact: true }),
    ).toBeVisible({ timeout: 15000 });
    await section.getByRole("button", { name: "Off", exact: true }).click();

    // Destructive path always confirms (notify.confirm dialog).
    await expect(
      page.getByText(
        "Turn off memory? This permanently deletes all saved memories.",
      ),
    ).toBeVisible({ timeout: 10000 });
    await page.getByRole("button", { name: "Confirm", exact: true }).click();

    // The off-mode helper copy replaces the on-mode one after the save.
    await expect(
      section.getByText("Memory is off. Saved memories were deleted."),
    ).toBeVisible({ timeout: 15000 });

    const state = await getMemoryState(page);
    expect(state.mode).toBe("off");
    expect(state.memories).toHaveLength(0);
  });
});
