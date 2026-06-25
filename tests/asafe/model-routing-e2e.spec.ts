/**
 * E2E tests for model selection and routing behavior.
 *
 * Covers:
 *  1. Model picker appears in chat composer (admin/editor only).
 *  2. "Auto" is the default selection on first load.
 *  3. Selecting a model sends it in the /api/chat request body as `chatModel`.
 *  4. Model picker is hidden (or disabled) for regular (non-entitled) users.
 *  5. Research mode toggle is gated to elevated roles (admin / editor).
 *  6. Auto-routing sends the correct model field in the request body, and
 *     research-mode messages carry `researchMode: true`.
 *
 * All suites that trigger chat use `page.route()` to intercept POST /api/chat
 * so they run deterministically without a live OpenRouter key.
 *
 * Test-id anchors (from the component source):
 *   model-selector-button   — the trigger button in the composer toolbar
 *   selected-model-name     — text node inside the trigger showing the active model
 *   model-selector-popover  — the Command popover rendered by SelectModel
 *   model-option-auto       — the "Auto" CommandItem
 *   model-option-{p}-{name} — a specific provider/model CommandItem
 *   model-search-input      — the search input inside the popover
 *   research-mode-toggle    — the research mode button (elevated users only)
 */

import { expect, test } from "@playwright/test";
import { TEST_USERS } from "../constants/test-users";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let _seq = 0;
function uid(): string {
  return `e2e-mr-${++_seq}-${process.pid}`;
}

/**
 * Minimal Vercel AI SDK UIMessageStream response — enough to make the chat
 * component render the assistant reply and exit the loading state.
 */
function stubStream(text: string): string {
  const msgId = `msg-stub-${uid()}`;
  const txtId = `txt-stub-${uid()}`;
  const chunks: string[] = [
    `data: ${JSON.stringify({ type: "start", messageId: msgId })}\n\n`,
    `data: ${JSON.stringify({ type: "start-step", stepType: "initial" })}\n\n`,
    `data: ${JSON.stringify({ type: "text-start", id: txtId })}\n\n`,
    `data: ${JSON.stringify({ type: "text-delta", id: txtId, delta: text })}\n\n`,
    `data: ${JSON.stringify({ type: "text-end", id: txtId })}\n\n`,
    `data: ${JSON.stringify({
      type: "finish-step",
      finishReason: "stop",
      usage: { inputTokens: 5, outputTokens: 10 },
    })}\n\n`,
    `data: ${JSON.stringify({
      type: "finish",
      finishReason: "stop",
      usage: { inputTokens: 5, outputTokens: 10 },
    })}\n\n`,
    "data: [DONE]\n\n",
  ];
  return chunks.join("");
}

/** Fulfill a route request with the stub stream. */
async function fulfillWithStream(
  route: import("@playwright/test").Route,
  text = "Stub response from mock.",
) {
  await route.fulfill({
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "x-vercel-ai-ui-message-stream": "v1",
    },
    body: stubStream(text),
  });
}

/** Type a message into the composer and press Enter. */
async function sendMessage(
  page: import("@playwright/test").Page,
  text: string,
) {
  const editor = page
    .locator('[contenteditable="true"]')
    .or(page.locator("textarea"))
    .first();
  await editor.click();
  await editor.fill(text);
  await page.keyboard.press("Enter");
}

// ---------------------------------------------------------------------------
// Suite 1: Model picker appears in chat composer (elevated users)
// ---------------------------------------------------------------------------

test.describe("Suite 1: Model picker appears in chat composer", () => {
  test.use({ storageState: TEST_USERS.admin.authFile });

  test("model-selector-button is visible for admin at '/'", async ({
    page,
  }) => {
    await page.goto("/", { waitUntil: "networkidle" });

    const btn = page.getByTestId("model-selector-button");
    await expect(btn).toBeVisible({ timeout: 10_000 });
  });

  test("clicking model-selector-button opens the model popover", async ({
    page,
  }) => {
    await page.goto("/", { waitUntil: "networkidle" });

    await page.getByTestId("model-selector-button").click();

    const popover = page.getByTestId("model-selector-popover");
    await expect(popover).toBeVisible({ timeout: 5_000 });
  });

  test("opened popover contains at least one model option", async ({
    page,
  }) => {
    await page.goto("/", { waitUntil: "networkidle" });

    await page.getByTestId("model-selector-button").click();

    // data-testid starts with "model-option-" (auto + per-model entries)
    const options = page.locator('[data-testid^="model-option-"]');
    await expect(options.first()).toBeVisible({ timeout: 5_000 });

    const count = await options.count();
    expect(
      count,
      "popover must expose at least one model option (auto or real model)",
    ).toBeGreaterThan(0);

    await page.keyboard.press("Escape");
  });

  test("editor user also sees the model-selector-button", async ({
    browser,
  }) => {
    const ctx = await browser.newContext({
      storageState: TEST_USERS.editor.authFile,
    });
    const page = await ctx.newPage();
    await page.goto("/", { waitUntil: "networkidle" });

    await expect(page.getByTestId("model-selector-button")).toBeVisible({
      timeout: 10_000,
    });

    await ctx.close();
  });
});

// ---------------------------------------------------------------------------
// Suite 2: Auto model is selected by default
// ---------------------------------------------------------------------------

test.describe("Suite 2: Auto model is selected by default", () => {
  test.use({ storageState: TEST_USERS.admin.authFile });

  test("selected-model-name shows 'Auto' before any selection is made", async ({
    page,
  }) => {
    await page.goto("/", { waitUntil: "networkidle" });

    const label = page.getByTestId("selected-model-name");
    await expect(label).toBeVisible({ timeout: 10_000 });

    const text = (await label.textContent()) ?? "";
    expect(
      text.toLowerCase(),
      `model label should default to "Auto" but got "${text}"`,
    ).toMatch(/auto/i);
  });

  test("Auto option is checked in the picker on a fresh page load", async ({
    page,
  }) => {
    await page.goto("/", { waitUntil: "networkidle" });

    // Open the picker
    await page.getByTestId("model-selector-button").click();
    const popover = page.getByTestId("model-selector-popover");
    await expect(popover).toBeVisible({ timeout: 5_000 });

    // The Auto CommandItem should contain the CheckIcon (data-testid="selected-model-check")
    const autoItem = page.getByTestId("model-option-auto");
    await expect(autoItem).toBeVisible();

    const check = autoItem.getByTestId("selected-model-check");
    // CheckIcon inside the Auto option signals it is currently selected.
    await expect(check).toBeVisible({ timeout: 5_000 });

    await page.keyboard.press("Escape");
  });

  test("selecting Auto from the picker resets the label to 'Auto'", async ({
    page,
  }) => {
    await page.goto("/", { waitUntil: "networkidle" });

    const btn = page.getByTestId("model-selector-button");
    await btn.click();

    // Click Auto explicitly
    await page.getByTestId("model-option-auto").click();

    const label = page.getByTestId("selected-model-name");
    const text = (await label.textContent()) ?? "";
    expect(text.toLowerCase()).toMatch(/auto/i);
  });
});

// ---------------------------------------------------------------------------
// Suite 3: Selecting a model sends it in the /api/chat request body
// ---------------------------------------------------------------------------

test.describe("Suite 3: Selected model appears in /api/chat request body", () => {
  test.use({ storageState: TEST_USERS.admin.authFile });

  test("chatModel field in POST /api/chat matches the model selected from picker", async ({
    page,
  }) => {
    // We need to pick a real model name from whatever the server exposes.
    // First load the models endpoint to find the first available model.
    await page.goto("/", { waitUntil: "networkidle" });

    const modelsResponse = await page.request.get("/api/chat/models");
    const providers = (await modelsResponse.json()) as Array<{
      provider: string;
      hasAPIKey: boolean;
      models: Array<{ name: string }>;
    }>;

    // Find the first provider with a key and at least one model.
    const targetProvider = providers.find(
      (p) => p.hasAPIKey && p.models.length > 0,
    );

    if (!targetProvider) {
      test.skip(
        true,
        "No provider with a configured API key found — skipping model-selection capture test",
      );
      return;
    }

    const targetModelName = targetProvider.models[0].name;
    const targetProviderName = targetProvider.provider;

    // Intercept the chat request to capture the body.
    let capturedBody: Record<string, unknown> | null = null;

    await page.route("**/api/chat", async (route) => {
      capturedBody = route.request().postDataJSON() as Record<string, unknown>;
      await fulfillWithStream(route, "Mocked model response.");
    });

    // Open the model picker and select the target model.
    const selectorBtn = page.getByTestId("model-selector-button");
    await selectorBtn.click();
    await expect(page.getByTestId("model-selector-popover")).toBeVisible({
      timeout: 5_000,
    });

    const modelOption = page.getByTestId(
      `model-option-${targetProviderName}-${targetModelName}`,
    );

    if ((await modelOption.count()) === 0) {
      // Search for the model by name if the testid doesn't directly match.
      const searchInput = page.getByTestId("model-search-input");
      await searchInput.fill(targetModelName);
      await page.locator(`[data-value="${targetModelName}"]`).first().click();
    } else {
      await modelOption.click();
    }

    // Verify the label updated.
    const label = page.getByTestId("selected-model-name");
    await expect(label).toHaveText(targetModelName, { timeout: 3_000 });

    // Send a message to trigger the API call.
    await sendMessage(page, "Hello from model routing E2E test.");

    // Wait for the stub response to appear.
    await expect(page.locator("text=Mocked model response")).toBeVisible({
      timeout: 10_000,
    });

    // Assert the captured request body contains the selected model.
    expect(
      capturedBody,
      "chat request body must have been captured",
    ).not.toBeNull();
    const body = capturedBody as any;

    expect(
      body?.chatModel,
      "chatModel must be present in the request body",
    ).toBeDefined();
    expect(body.chatModel?.provider).toBe(targetProviderName);
    expect(body.chatModel?.model).toBe(targetModelName);
  });

  test("selecting Auto then sending omits or nulls chatModel in the request body", async ({
    page,
  }) => {
    let capturedBody: Record<string, unknown> | null = null;

    await page.route("**/api/chat", async (route) => {
      capturedBody = route.request().postDataJSON() as Record<string, unknown>;
      await fulfillWithStream(route, "Auto-routed response.");
    });

    await page.goto("/", { waitUntil: "networkidle" });

    // Explicitly set to Auto.
    await page.getByTestId("model-selector-button").click();
    await page.getByTestId("model-option-auto").click();

    // Verify label says Auto.
    const label = page.getByTestId("selected-model-name");
    await expect(label).toHaveText(/auto/i, { timeout: 3_000 });

    await sendMessage(page, "Auto-mode message.");

    await expect(page.locator("text=Auto-routed response")).toBeVisible({
      timeout: 10_000,
    });

    expect(capturedBody).not.toBeNull();
    const body = capturedBody as any;

    // When Auto is selected the client sends chatModel as undefined / absent / null.
    const chatModel = body?.chatModel;
    const isAbsentOrNull = chatModel === undefined || chatModel === null;
    expect(
      isAbsentOrNull,
      `chatModel should be absent or null for Auto selection but got: ${JSON.stringify(chatModel)}`,
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Suite 4: Model picker hidden (or disabled) for non-entitled regular users
// ---------------------------------------------------------------------------

test.describe("Suite 4: Model picker gating for regular users", () => {
  test.use({ storageState: TEST_USERS.regular.authFile });

  test("regular user: model-selector-button is absent or disabled at '/'", async ({
    page,
  }) => {
    await page.goto("/", { waitUntil: "networkidle" });

    const btn = page.getByTestId("model-selector-button");
    const count = await btn.count();

    if (count === 0) {
      // Fully hidden — gate enforced.
      return;
    }

    // If rendered, must be disabled.
    const isDisabled =
      (await btn.getAttribute("disabled")) !== null ||
      (await btn.getAttribute("aria-disabled")) === "true" ||
      !(await btn.isEnabled());

    expect(
      isDisabled,
      "model-selector-button is visible for a regular user but must be disabled",
    ).toBe(true);
  });

  test("regular user: model-selector-popover never opens", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });

    const btn = page.getByTestId("model-selector-button");
    const btnVisible = await btn.isVisible().catch(() => false);

    if (btnVisible) {
      // Force-click a potentially-disabled button and confirm the popover stays hidden.
      await btn.click({ force: true });
      await page.waitForTimeout(400);
    }

    await expect(page.getByTestId("model-selector-popover")).not.toBeVisible();
  });

  test("regular user: selected-model-name is absent or reads 'Auto'", async ({
    page,
  }) => {
    await page.goto("/", { waitUntil: "networkidle" });

    const label = page.getByTestId("selected-model-name");
    const isVisible = await label.isVisible().catch(() => false);

    if (isVisible) {
      const text = (await label.textContent()) ?? "";
      expect(
        text.toLowerCase(),
        `regular user must see "Auto" (or nothing), got "${text}"`,
      ).toMatch(/auto/i);
    }
    // If not visible — the whole picker is suppressed, which also satisfies the gate.
  });

  test("regular user: GET /api/chat/models does not 403", async ({ page }) => {
    const res = await page.request.get("/api/chat/models");
    expect(
      res.status(),
      "models endpoint should not 403 a regular authenticated user",
    ).not.toBe(403);
  });
});

// ---------------------------------------------------------------------------
// Suite 5: Research mode toggle is role-gated
// ---------------------------------------------------------------------------

test.describe("Suite 5: Research mode toggle role gate", () => {
  test("regular user: research-mode-toggle is NOT visible at '/'", async ({
    browser,
  }) => {
    const ctx = await browser.newContext({
      storageState: TEST_USERS.regular.authFile,
    });
    const page = await ctx.newPage();
    await page.goto("/", { waitUntil: "networkidle" });

    // The toggle is rendered only for admin/editor roles in PromptInput.
    // For a regular user it should be absent entirely.
    const toggle = page.getByTestId("research-mode-toggle");
    const isVisible = await toggle.isVisible().catch(() => false);

    if (isVisible) {
      // If visible it must at minimum be disabled.
      const isDisabled =
        (await toggle.getAttribute("disabled")) !== null ||
        (await toggle.getAttribute("aria-disabled")) === "true" ||
        !(await toggle.isEnabled());
      expect(
        isDisabled,
        "research-mode-toggle must be disabled (or absent) for regular users",
      ).toBe(true);
    }
    // Absent is the expected outcome — no assertion needed.

    await ctx.close();
  });

  test("admin user: research-mode-toggle IS visible and interactive at '/'", async ({
    browser,
  }) => {
    const ctx = await browser.newContext({
      storageState: TEST_USERS.admin.authFile,
    });
    const page = await ctx.newPage();
    await page.goto("/", { waitUntil: "networkidle" });

    const toggle = page.getByTestId("research-mode-toggle");
    await expect(toggle).toBeVisible({ timeout: 10_000 });
    await expect(toggle).toBeEnabled();

    await ctx.close();
  });

  test("editor user: research-mode-toggle IS visible and interactive at '/'", async ({
    browser,
  }) => {
    const ctx = await browser.newContext({
      storageState: TEST_USERS.editor.authFile,
    });
    const page = await ctx.newPage();
    await page.goto("/", { waitUntil: "networkidle" });

    const toggle = page.getByTestId("research-mode-toggle");
    await expect(toggle).toBeVisible({ timeout: 10_000 });
    await expect(toggle).toBeEnabled();

    await ctx.close();
  });

  test("admin: research-mode-toggle toggles aria-pressed state on click", async ({
    browser,
  }) => {
    const ctx = await browser.newContext({
      storageState: TEST_USERS.admin.authFile,
    });
    const page = await ctx.newPage();
    await page.goto("/", { waitUntil: "networkidle" });

    const toggle = page.getByTestId("research-mode-toggle");
    await expect(toggle).toHaveAttribute("aria-pressed", "false");

    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-pressed", "true");

    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-pressed", "false");

    await ctx.close();
  });

  test("regular user: POST /api/chat with researchMode:true does not crash (not 5xx)", async ({
    browser,
  }) => {
    // The gate is enforced in the UI but the server should not 5xx if a crafted
    // request arrives with researchMode:true from a regular user.
    const ctx = await browser.newContext({
      storageState: TEST_USERS.regular.authFile,
    });
    const page = await ctx.newPage();

    const res = await page.request.post("/api/chat", {
      headers: { "Content-Type": "application/json" },
      data: {
        id: uid(),
        message: {
          id: uid(),
          role: "user",
          parts: [{ type: "text", text: "research ping" }],
        },
        toolChoice: "none",
        researchMode: true,
      },
      failOnStatusCode: false,
    });

    expect(
      res.status(),
      "server must not 5xx when a regular user sends researchMode:true",
    ).toBeLessThan(500);

    await ctx.close();
  });
});

// ---------------------------------------------------------------------------
// Suite 6: Auto routing — model choice observable through request body
// ---------------------------------------------------------------------------

test.describe("Suite 6: Auto routing — request body inspection", () => {
  test.use({ storageState: TEST_USERS.admin.authFile });

  test("Auto mode: sending a short general message omits chatModel (server routes)", async ({
    page,
  }) => {
    let capturedBody: Record<string, unknown> | null = null;

    await page.route("**/api/chat", async (route) => {
      capturedBody = route.request().postDataJSON() as Record<string, unknown>;
      await fulfillWithStream(route, "Short general answer.");
    });

    await page.goto("/", { waitUntil: "networkidle" });

    // Ensure Auto is selected.
    await page.getByTestId("model-selector-button").click();
    await page.getByTestId("model-option-auto").click();

    await sendMessage(page, "Hi.");
    await expect(page.locator("text=Short general answer")).toBeVisible({
      timeout: 10_000,
    });

    const body = capturedBody as any;
    expect(body).not.toBeNull();

    // When Auto is active the client sends chatModel as absent, undefined, or null.
    const chatModel = body?.chatModel;
    expect(
      chatModel == null,
      `chatModel should be null/absent for Auto mode but got: ${JSON.stringify(chatModel)}`,
    ).toBe(true);
  });

  test("Auto mode + research mode: request body contains researchMode:true and chatModel is absent", async ({
    page,
  }) => {
    let capturedBody: Record<string, unknown> | null = null;

    await page.route("**/api/chat", async (route) => {
      capturedBody = route.request().postDataJSON() as Record<string, unknown>;
      await fulfillWithStream(
        route,
        "Research synthesis: the answer is comprehensive.",
      );
    });

    await page.goto("/", { waitUntil: "networkidle" });

    // Ensure Auto is selected.
    await page.getByTestId("model-selector-button").click();
    await page.getByTestId("model-option-auto").click();

    // Enable research mode.
    const toggle = page.getByTestId("research-mode-toggle");
    await expect(toggle).toBeVisible({ timeout: 10_000 });
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-pressed", "true");

    await sendMessage(
      page,
      "Explain the trade-offs between OLAP and OLTP databases.",
    );
    await expect(page.locator("text=Research synthesis")).toBeVisible({
      timeout: 10_000,
    });

    const body = capturedBody as any;
    expect(body).not.toBeNull();

    // chatModel absent — server handles model selection via routing.
    const chatModel = body?.chatModel;
    expect(
      chatModel == null,
      `chatModel should be null/absent for Auto+research mode but got: ${JSON.stringify(chatModel)}`,
    ).toBe(true);

    // researchMode flag must be explicitly true.
    expect(
      body?.researchMode,
      "researchMode must be true in the request body when the toggle is on",
    ).toBe(true);
  });

  test("explicit model selection: chatModel in request body matches what was picked", async ({
    page,
  }) => {
    // Discover a usable model from the models endpoint.
    await page.goto("/", { waitUntil: "networkidle" });

    const modelsRes = await page.request.get("/api/chat/models");
    const providers = (await modelsRes.json()) as Array<{
      provider: string;
      hasAPIKey: boolean;
      models: Array<{ name: string }>;
    }>;

    const usable = providers.find((p) => p.hasAPIKey && p.models.length > 0);
    if (!usable) {
      test.skip(true, "No usable provider with API key — skipping");
      return;
    }

    const pickedModel = usable.models[0].name;
    const pickedProvider = usable.provider;

    let capturedBody: Record<string, unknown> | null = null;

    await page.route("**/api/chat", async (route) => {
      capturedBody = route.request().postDataJSON() as Record<string, unknown>;
      await fulfillWithStream(route, "Explicit-model response.");
    });

    // Navigate back — the route is already registered.
    await page.reload({ waitUntil: "networkidle" });

    // Select the explicit model.
    await page.getByTestId("model-selector-button").click();
    await expect(page.getByTestId("model-selector-popover")).toBeVisible({
      timeout: 5_000,
    });

    const modelOption = page.getByTestId(
      `model-option-${pickedProvider}-${pickedModel}`,
    );
    if ((await modelOption.count()) > 0) {
      await modelOption.click();
    } else {
      const searchInput = page.getByTestId("model-search-input");
      await searchInput.fill(pickedModel);
      await page.locator(`[data-value="${pickedModel}"]`).first().click();
    }

    await sendMessage(page, "Tell me something interesting.");
    await expect(page.locator("text=Explicit-model response")).toBeVisible({
      timeout: 10_000,
    });

    const body = capturedBody as any;
    expect(body).not.toBeNull();
    expect(body?.chatModel?.provider).toBe(pickedProvider);
    expect(body?.chatModel?.model).toBe(pickedModel);
  });

  test("switching from explicit model back to Auto clears chatModel in subsequent request", async ({
    page,
  }) => {
    await page.goto("/", { waitUntil: "networkidle" });

    // Discover a usable model.
    const modelsRes = await page.request.get("/api/chat/models");
    const providers = (await modelsRes.json()) as Array<{
      provider: string;
      hasAPIKey: boolean;
      models: Array<{ name: string }>;
    }>;
    const usable = providers.find((p) => p.hasAPIKey && p.models.length > 0);
    if (!usable) {
      test.skip(true, "No usable provider with API key — skipping");
      return;
    }

    const pickedModel = usable.models[0].name;
    const pickedProvider = usable.provider;

    const bodies: Array<Record<string, unknown>> = [];

    await page.route("**/api/chat", async (route) => {
      bodies.push(route.request().postDataJSON() as Record<string, unknown>);
      await fulfillWithStream(route, `Reply ${bodies.length}`);
    });

    // 1. Select an explicit model and send message 1.
    await page.getByTestId("model-selector-button").click();
    await expect(page.getByTestId("model-selector-popover")).toBeVisible({
      timeout: 5_000,
    });

    const modelOption = page.getByTestId(
      `model-option-${pickedProvider}-${pickedModel}`,
    );
    if ((await modelOption.count()) > 0) {
      await modelOption.click();
    } else {
      const searchInput = page.getByTestId("model-search-input");
      await searchInput.fill(pickedModel);
      await page.locator(`[data-value="${pickedModel}"]`).first().click();
    }

    await sendMessage(page, "First message with explicit model.");
    await expect(page.locator("text=Reply 1")).toBeVisible({
      timeout: 10_000,
    });

    // 2. Switch back to Auto.
    await page.getByTestId("model-selector-button").click();
    await page.getByTestId("model-option-auto").click();

    await sendMessage(page, "Second message back in Auto mode.");
    await expect(page.locator("text=Reply 2")).toBeVisible({
      timeout: 10_000,
    });

    // Assertions
    expect(bodies.length).toBeGreaterThanOrEqual(2);

    const firstChatModel = (bodies[0] as any)?.chatModel;
    expect(firstChatModel?.provider).toBe(pickedProvider);
    expect(firstChatModel?.model).toBe(pickedModel);

    const secondChatModel = (bodies[1] as any)?.chatModel;
    expect(
      secondChatModel == null,
      `After switching back to Auto, chatModel should be null/absent but got: ${JSON.stringify(secondChatModel)}`,
    ).toBe(true);
  });
});
