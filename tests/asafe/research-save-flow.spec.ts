/**
 * E2E tests for the deep research → Save as Document flow.
 *
 * Coverage:
 *  - Full flow: research response renders, Save as Document button navigates to /documents/{id}
 *  - Loading state: button shows spinner while save is in-flight
 *  - Error handling: server error shows toast, URL does not change, button re-enables
 *  - Non-research messages: Save as Document button is absent
 *  - Multiple research messages: Save as Document button appears only on the last message
 *
 * All tests mock POST /api/chat so they run deterministically without a live
 * OpenRouter key. The document creation server action is allowed to reach the
 * real DB (Suite 1) because the URL-change assertion is the most reliable
 * integration signal for "save succeeded".
 *
 * The stream must include a "message-metadata" event with { researchMode: true }
 * on the finish chunk — that is the signal the message.tsx SaveResearchButton
 * reads via (message.metadata as ChatMetadata)?.researchMode.
 */

import { expect, test } from "@playwright/test";
import { TEST_USERS } from "../constants/test-users";

// ---------------------------------------------------------------------------
// Stream helper
// ---------------------------------------------------------------------------

/**
 * Builds a minimal Vercel AI SDK UIMessageStream SSE body.
 *
 * The "message-metadata" event carries { researchMode: true } which is what
 * the UI reads to decide whether to show the SaveResearchButton.
 */
function researchStream(text: string): string {
  const chunks: string[] = [
    `data: ${JSON.stringify({ type: "start", messageId: "msg-r1" })}\n\n`,
    `data: ${JSON.stringify({ type: "start-step", stepType: "initial" })}\n\n`,
    `data: ${JSON.stringify({ type: "text-start", id: "txt-1" })}\n\n`,
    `data: ${JSON.stringify({ type: "text-delta", id: "txt-1", delta: text })}\n\n`,
    `data: ${JSON.stringify({ type: "text-end", id: "txt-1" })}\n\n`,
    `data: ${JSON.stringify({ type: "finish-step", finishReason: "stop", usage: { inputTokens: 10, outputTokens: 20 } })}\n\n`,
    // message-metadata carries the ChatMetadata that message.tsx checks for researchMode
    `data: ${JSON.stringify({ type: "message-metadata", messageMetadata: { researchMode: true } })}\n\n`,
    `data: ${JSON.stringify({ type: "finish", finishReason: "stop", usage: { inputTokens: 10, outputTokens: 20 } })}\n\n`,
    "data: [DONE]\n\n",
  ];
  return chunks.join("");
}

/** Non-research stream — no message-metadata with researchMode. */
function plainStream(text: string): string {
  const chunks: string[] = [
    `data: ${JSON.stringify({ type: "start", messageId: "msg-p1" })}\n\n`,
    `data: ${JSON.stringify({ type: "start-step", stepType: "initial" })}\n\n`,
    `data: ${JSON.stringify({ type: "text-start", id: "txt-p1" })}\n\n`,
    `data: ${JSON.stringify({ type: "text-delta", id: "txt-p1", delta: text })}\n\n`,
    `data: ${JSON.stringify({ type: "text-end", id: "txt-p1" })}\n\n`,
    `data: ${JSON.stringify({ type: "finish-step", finishReason: "stop", usage: { inputTokens: 10, outputTokens: 20 } })}\n\n`,
    `data: ${JSON.stringify({ type: "finish", finishReason: "stop", usage: { inputTokens: 10, outputTokens: 20 } })}\n\n`,
    "data: [DONE]\n\n",
  ];
  return chunks.join("");
}

/** Fulfills the /api/chat route with a stream body and correct SSE headers. */
async function fulfillStream(
  route: import("@playwright/test").Route,
  body: string,
): Promise<void> {
  await route.fulfill({
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "x-vercel-ai-ui-message-stream": "v1",
    },
    body,
  });
}

/** Locates the chat input (contenteditable or textarea). */
function chatEditor(page: import("@playwright/test").Page) {
  return page
    .locator('[contenteditable="true"]')
    .or(page.locator("textarea"))
    .first();
}

/** Enables research mode toggle, asserts it is on. */
async function enableResearchMode(
  page: import("@playwright/test").Page,
): Promise<void> {
  const toggle = page.getByTestId("research-mode-toggle");
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
}

/** Sends a message via the chat editor and keyboard Enter. */
async function sendMessage(
  page: import("@playwright/test").Page,
  text: string,
): Promise<void> {
  const editor = chatEditor(page);
  await editor.click();
  await editor.fill(text);
  await page.keyboard.press("Enter");
}

// ---------------------------------------------------------------------------
// Suite 1 — Full research → save → navigate to document
// ---------------------------------------------------------------------------
test.describe("Suite 1: Full research → save → navigate to document", () => {
  test.use({ storageState: TEST_USERS.admin.authFile });

  test("Save as Document navigates to /documents/{uuid} and editor is visible", async ({
    page,
  }) => {
    await page.route("**/api/chat", (route) =>
      fulfillStream(route, researchStream("Deep research: the answer is 42.")),
    );

    await page.goto("/");
    await enableResearchMode(page);
    await sendMessage(page, "Research: what is the answer to everything?");

    // Wait for research response text
    await expect(
      page.locator("text=Deep research: the answer is 42"),
    ).toBeVisible({
      timeout: 10_000,
    });

    // Save button must be visible after stream completes
    const saveBtn = page.getByTestId("research-save-document");
    await expect(saveBtn).toBeVisible({ timeout: 5_000 });

    // Click save — allow the real server action to run
    await saveBtn.click();

    // URL must change to /documents/<uuid>
    await expect(page).toHaveURL(/\/documents\/[0-9a-f-]{36}/, {
      timeout: 15_000,
    });

    // The document editor page should render (TipTap editor)
    // The editor is rendered inside a [contenteditable] within the documents page.
    await expect(page.locator('[contenteditable="true"]').first()).toBeVisible({
      timeout: 10_000,
    });
  });
});

// ---------------------------------------------------------------------------
// Suite 2 — Save as Document button shows loading state
// ---------------------------------------------------------------------------
test.describe("Suite 2: Save as Document shows loading spinner during save", () => {
  test.use({ storageState: TEST_USERS.admin.authFile });

  test("button is disabled and shows Loader2 spinner while save is in-flight", async ({
    page,
  }) => {
    await page.route("**/api/chat", (route) =>
      fulfillStream(
        route,
        researchStream("Research finding: loading state test."),
      ),
    );

    // Intercept the server-action RPC (Next.js posts to the current page with
    // a special Next-Action header). Add a 1.5 s delay so we can observe the
    // loading state. We forward the real body so the action still runs.
    await page.route("**", async (route) => {
      const req = route.request();
      // Next.js Server Actions are POSTs with a "Next-Action" header.
      if (
        req.method() === "POST" &&
        req.headers()["next-action"] !== undefined
      ) {
        // Delay, then let the request proceed to the real server.
        await new Promise((r) => setTimeout(r, 1500));
        await route.continue();
      } else {
        await route.continue();
      }
    });

    await page.goto("/");
    await enableResearchMode(page);
    await sendMessage(page, "Loading state test query");

    await expect(
      page.locator("text=Research finding: loading state test"),
    ).toBeVisible({ timeout: 10_000 });

    const saveBtn = page.getByTestId("research-save-document");
    await expect(saveBtn).toBeVisible({ timeout: 5_000 });

    // Start clicking — the button will enter loading state
    await saveBtn.click();

    // Button must be disabled while saving
    await expect(saveBtn).toBeDisabled({ timeout: 3_000 });

    // Loader2 spinner renders as an svg inside the button
    await expect(saveBtn.locator("svg")).toBeVisible();

    // After save completes the button disappears (navigation to /documents/...)
    // or re-enables if it fails. Either way, we verified the loading state.
    // Give the navigation a chance to happen (or the button to re-enable).
    await expect(page).toHaveURL(/\/documents\/[0-9a-f-]{36}|\//, {
      timeout: 15_000,
    });
  });
});

// ---------------------------------------------------------------------------
// Suite 3 — Save as Document handles server error gracefully
// ---------------------------------------------------------------------------
test.describe("Suite 3: Server error — toast appears, URL stays, button re-enables", () => {
  test.use({ storageState: TEST_USERS.admin.authFile });

  test("error toast on failed save and button returns to enabled state", async ({
    page,
  }) => {
    await page.route("**/api/chat", (route) =>
      fulfillStream(
        route,
        researchStream("Research on error handling behaviour."),
      ),
    );

    // Intercept the Next.js Server Action call and return an error payload.
    // Next.js server actions over the wire return a special encoded response;
    // returning a plain HTTP error causes the client catch block to run, which
    // calls toast.error(t("researchSaveError")).
    await page.route("**", async (route) => {
      const req = route.request();
      if (
        req.method() === "POST" &&
        req.headers()["next-action"] !== undefined
      ) {
        await route.fulfill({
          status: 500,
          body: JSON.stringify({ error: "Internal Server Error" }),
          headers: { "Content-Type": "application/json" },
        });
      } else {
        await route.continue();
      }
    });

    await page.goto("/");
    const initialUrl = page.url();

    await enableResearchMode(page);
    await sendMessage(page, "Error scenario research query");

    await expect(
      page.locator("text=Research on error handling behaviour"),
    ).toBeVisible({ timeout: 10_000 });

    const saveBtn = page.getByTestId("research-save-document");
    await expect(saveBtn).toBeVisible({ timeout: 5_000 });

    await saveBtn.click();

    // An error toast must appear. Sonner renders toasts in a [data-sonner-toaster]
    // element; individual toasts are li elements with role="status" or visible text.
    await expect(
      page
        .locator("[data-sonner-toaster]")
        .or(page.locator("[data-sonner-toast]")),
    ).toBeVisible({ timeout: 8_000 });

    // URL must NOT have changed to a document page
    expect(page.url()).toBe(initialUrl);

    // Button must be re-enabled after the error (savingRef is reset in finally)
    await expect(saveBtn).toBeEnabled({ timeout: 5_000 });
  });
});

// ---------------------------------------------------------------------------
// Suite 4 — Only research responses show the Save as Document button
// ---------------------------------------------------------------------------
test.describe("Suite 4: Save as Document absent for non-research responses", () => {
  test.use({ storageState: TEST_USERS.admin.authFile });

  test("Save as Document button is NOT visible after a plain (non-research) message", async ({
    page,
  }) => {
    await page.route("**/api/chat", (route) =>
      fulfillStream(
        route,
        plainStream("A normal reply with no research mode."),
      ),
    );

    await page.goto("/");

    // Research mode toggle is OFF — do not click it
    await expect(page.getByTestId("research-mode-toggle")).toHaveAttribute(
      "aria-pressed",
      "false",
    );

    await sendMessage(page, "Hello, how are you?");

    await expect(
      page.locator("text=A normal reply with no research mode"),
    ).toBeVisible({ timeout: 10_000 });

    // Button must be absent
    await expect(page.getByTestId("research-save-document")).not.toBeVisible();
  });

  test("Save as Document button is absent even when research mode toggle was reset after send", async ({
    page,
  }) => {
    // The toggle auto-resets to off after each message (regression guard from
    // deep-research.spec.ts). A plain response after that reset must not show
    // the button — only messages whose server response carries researchMode:true
    // in the metadata get the button.
    await page.route("**/api/chat", (route) =>
      fulfillStream(
        route,
        plainStream("Follow-up reply without research flag."),
      ),
    );

    await page.goto("/");

    // Toggle on, send, toggle goes back off — this response has no researchMode metadata
    const toggle = page.getByTestId("research-mode-toggle");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-pressed", "true");

    // Use a separate intercepted stream for this case that does NOT include
    // message-metadata with researchMode. Override the route.
    await page.route("**/api/chat", (route) =>
      fulfillStream(
        route,
        plainStream("Follow-up reply without research flag."),
      ),
    );

    await sendMessage(page, "Non-research follow-up");

    await expect(
      page.locator("text=Follow-up reply without research flag"),
    ).toBeVisible({ timeout: 10_000 });

    await expect(page.getByTestId("research-save-document")).not.toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Suite 5 — Multiple research messages: Save as Document on last message only
// ---------------------------------------------------------------------------
test.describe("Suite 5: Multiple research messages — Save as Document on last message only", () => {
  test.use({ storageState: TEST_USERS.admin.authFile });

  test("only the last assistant research message shows the Save as Document button", async ({
    page,
  }) => {
    let callCount = 0;
    const responses = [
      researchStream("First research answer about topic A."),
      researchStream("Second research answer about topic B."),
    ];

    await page.route("**/api/chat", (route) => {
      const body = responses[callCount] ?? responses[responses.length - 1];
      callCount++;
      return fulfillStream(route, body);
    });

    await page.goto("/");

    // ── First research message ──────────────────────────────────────────────
    await enableResearchMode(page);
    await sendMessage(page, "Research question #1");

    await expect(
      page.locator("text=First research answer about topic A"),
    ).toBeVisible({ timeout: 10_000 });

    // After the first message completes and the toggle has reset, the button
    // is visible because this is currently the last message.
    await expect(page.getByTestId("research-save-document")).toBeVisible({
      timeout: 5_000,
    });

    // ── Second research message ─────────────────────────────────────────────
    await enableResearchMode(page);
    await sendMessage(page, "Research question #2");

    await expect(
      page.locator("text=Second research answer about topic B"),
    ).toBeVisible({ timeout: 10_000 });

    // The button should now be visible on the LAST (second) message.
    // Exactly one save button should be visible (the message.tsx condition is
    // `isLastMessage && !isLoading && !isUserMessage && !readonly && researchMode`).
    const saveBtns = page.getByTestId("research-save-document");
    await expect(saveBtns).toBeVisible({ timeout: 5_000 });

    // Only one instance of the button should be visible at a time.
    const count = await saveBtns.count();
    expect(count).toBe(1);
  });
});
