/**
 * E2E tests for follow-up question chips.
 *
 * After the LAST assistant message finishes streaming, the chat route writes a
 * "data-follow-ups" part containing 3 suggested follow-up questions (generated
 * by Qwen3-8b via OpenRouter). The message component renders them as
 * [data-testid="follow-up-chips"] buttons only when:
 *   1. The message is the last assistant message.
 *   2. The assistant is NOT still loading.
 *   3. sendMessage is available (not a readonly view).
 *   4. The "data-follow-ups" part carries a non-empty questions array.
 *
 * All tests intercept POST /api/chat with page.route() and return a complete
 * fake streaming response that includes the "data-follow-ups" part, making
 * every test deterministic and fast.
 *
 * Wire format (Vercel AI SDK UIMessageStream / JsonToSseTransformStream):
 *   Each object written to dataStream.write() is serialized as:
 *     data: <JSON>\n\n
 *   Stream ends with:
 *     data: [DONE]\n\n
 *
 *   The "data-follow-ups" part matches the SDK data-* schema:
 *     { type: "data-follow-ups", data: { questions: string[] } }
 *
 *   The server writes this part after result.text resolves (after finish-step),
 *   so the mock emits it between finish-step and finish.
 */

import { type Page, expect, test } from "@playwright/test";
import { TEST_USERS } from "../constants/test-users";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Fake follow-up questions used across all mocked responses. */
const MOCK_QUESTIONS = [
  "How does this work in practice?",
  "What are the main limitations?",
  "Can you give me a concrete example?",
];

/**
 * First assistant reply — long enough to satisfy the 80-char minimum-length
 * guard inside generateFollowUps (bypassed by the mock, but used in DOM assertions).
 */
const MOCK_RESPONSE_TEXT =
  "This is a deterministic Playwright mock response. " +
  "It is intentionally long enough to satisfy the follow-up generation guard.";

/** Second assistant reply — used in multi-turn tests. */
const MOCK_RESPONSE_TEXT_2 =
  "This is the second deterministic Playwright mock response. " +
  "It also exceeds the minimum character count required by the generation guard.";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a complete Vercel AI SDK UIMessageStream SSE body for one assistant turn.
 *
 * Pass followUps as an array to include the data-follow-ups chunk.
 * Omit or pass an empty array to produce a response with no follow-up chips.
 */
function chatStream(
  messageId: string,
  responseText: string,
  followUps?: string[],
): string {
  const textPartId = "text-0";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chunks: any[] = [
    { type: "start", messageId },
    { type: "start-step", stepType: "initial" },
    { type: "text-start", id: textPartId },
    { type: "text-delta", id: textPartId, delta: responseText },
    { type: "text-end", id: textPartId },
    {
      type: "finish-step",
      finishReason: "stop",
      usage: { inputTokens: 10, outputTokens: 20 },
    },
  ];

  if (followUps && followUps.length > 0) {
    chunks.push({ type: "data-follow-ups", data: { questions: followUps } });
  }

  chunks.push({
    type: "finish",
    finishReason: "stop",
    usage: { inputTokens: 10, outputTokens: 20 },
  });

  return (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    chunks.map((c: any) => `data: ${JSON.stringify(c)}\n\n`).join("") +
    "data: [DONE]\n\n"
  );
}

/** Standard SSE response headers required by the Vercel AI SDK client. */
const SSE_HEADERS = {
  "content-type": "text/event-stream",
  "cache-control": "no-cache",
  connection: "keep-alive",
  "x-vercel-ai-ui-message-stream": "v1",
};

/**
 * Install a route handler on the chat API endpoint that fulfills each POST
 * with the result of buildResponse(callIndex). The call index starts at 0
 * and increments for each intercepted request, letting callers serve
 * different responses per request.
 *
 * Returns an async cleanup function that removes the route.
 */
async function mockChat(
  page: Page,
  buildResponse: (callIndex: number) => string,
): Promise<() => Promise<void>> {
  let callIndex = 0;

  await page.route("**/api/chat", async (route) => {
    const body = buildResponse(callIndex);
    callIndex++;
    await route.fulfill({
      status: 200,
      headers: SSE_HEADERS,
      body,
    });
  });

  return async () => {
    await page.unroute("**/api/chat").catch(() => {});
  };
}

/**
 * Type a message into the chat input and press Enter to submit it.
 * Handles both textarea and contenteditable inputs.
 */
async function sendMessage(page: Page, text: string): Promise<void> {
  const input = page
    .locator('[contenteditable="true"]')
    .or(page.locator("textarea"))
    .first();
  await input.click();
  await input.fill(text);
  await input.press("Enter");
}

// ---------------------------------------------------------------------------
// Suite 1: Follow-up chips appear after the assistant response
// ---------------------------------------------------------------------------

test.describe("Follow-up chips — appear after response", () => {
  test.use({ storageState: TEST_USERS.regular.authFile });

  test("chips are visible after a streamed response that includes follow-ups", async ({
    page,
  }) => {
    await mockChat(page, () =>
      chatStream("msg-1", MOCK_RESPONSE_TEXT, MOCK_QUESTIONS),
    );
    await page.goto("/", { waitUntil: "networkidle" });

    await sendMessage(page, "What is the capital of France?");

    // The chips container renders only when loading is done AND follow-ups exist.
    const chips = page.getByTestId("follow-up-chips");
    await expect(chips).toBeVisible({ timeout: 15_000 });

    // All 3 mock questions must be rendered as buttons inside the container.
    for (const question of MOCK_QUESTIONS) {
      await expect(chips.getByRole("button", { name: question })).toBeVisible();
    }
  });

  test("exactly 3 chips appear when the mock returns 3 questions", async ({
    page,
  }) => {
    await mockChat(page, () =>
      chatStream("msg-1", MOCK_RESPONSE_TEXT, MOCK_QUESTIONS),
    );
    await page.goto("/", { waitUntil: "networkidle" });

    await sendMessage(page, "Count the chips please");

    const chips = page.getByTestId("follow-up-chips");
    await expect(chips).toBeVisible({ timeout: 15_000 });

    // Exactly 3 chip buttons must be present (no duplicates, no extras).
    await expect(chips.getByRole("button")).toHaveCount(MOCK_QUESTIONS.length);
  });
});

// ---------------------------------------------------------------------------
// Suite 2: Clicking a chip sends that message
// ---------------------------------------------------------------------------

test.describe("Follow-up chips — clicking sends the question", () => {
  test.use({ storageState: TEST_USERS.regular.authFile });

  test("clicking the first chip sends its text as a new user message", async ({
    page,
  }) => {
    let capturedSecondBody: Record<string, unknown> | null = null;
    let apiCallCount = 0;

    // Install a combined route handler that:
    //   - call 1: returns response with chips
    //   - call 2: captures the request body and returns a minimal response
    await page.route("**/api/chat", async (route, request) => {
      apiCallCount++;
      if (apiCallCount === 1) {
        await route.fulfill({
          status: 200,
          headers: SSE_HEADERS,
          body: chatStream("msg-1", MOCK_RESPONSE_TEXT, MOCK_QUESTIONS),
        });
      } else {
        try {
          capturedSecondBody = request.postDataJSON() as Record<
            string,
            unknown
          >;
        } catch {
          // Ignore JSON parse errors.
        }
        await route.fulfill({
          status: 200,
          headers: SSE_HEADERS,
          body: chatStream("msg-2", "Received your follow-up question.", []),
        });
      }
    });

    await page.goto("/", { waitUntil: "networkidle" });

    await sendMessage(page, "Initial question to get chips");

    const chips = page.getByTestId("follow-up-chips");
    await expect(chips).toBeVisible({ timeout: 15_000 });

    // Read the first chip's text before clicking.
    const firstChip = chips.getByRole("button").first();
    const chipText = (await firstChip.textContent())?.trim() ?? "";
    expect(chipText).toBeTruthy();

    // Click the chip — the component calls sendMessage({ text: q }) which fires
    // a POST to the chat API with the chip text as the user message content.
    await firstChip.click();

    // The chip text must appear somewhere in the conversation as a user message.
    await expect(page.getByText(chipText, { exact: false })).toBeVisible({
      timeout: 10_000,
    });

    // A second POST to the chat API must have been made (chip triggered a send).
    expect(apiCallCount).toBeGreaterThanOrEqual(2);

    // The second request body must contain the chip text as message content.
    if (capturedSecondBody) {
      const bodyStr = JSON.stringify(capturedSecondBody);
      expect(bodyStr).toContain(chipText);
    }
  });
});

// ---------------------------------------------------------------------------
// Suite 3: Chips disappear when a new message is sent
// ---------------------------------------------------------------------------

test.describe("Follow-up chips — disappear after a new message is sent", () => {
  test.use({ storageState: TEST_USERS.regular.authFile });

  test("chips from the first response are absent after the second message", async ({
    page,
  }) => {
    await mockChat(page, (idx) => {
      const id = `msg-${idx + 1}`;
      const text = idx === 0 ? MOCK_RESPONSE_TEXT : MOCK_RESPONSE_TEXT_2;
      // Only the first response includes follow-ups; the second does not.
      const followUps = idx === 0 ? MOCK_QUESTIONS : [];
      return chatStream(id, text, followUps);
    });

    await page.goto("/", { waitUntil: "networkidle" });

    // First message — chips should appear.
    await sendMessage(page, "First question");
    const chips = page.getByTestId("follow-up-chips");
    await expect(chips).toBeVisible({ timeout: 15_000 });

    // Send a second message — the first response is no longer the last message,
    // so its chips must disappear.
    await sendMessage(page, "Second question to push chips away");

    // Wait for the second response to appear.
    await expect(
      page.getByText(MOCK_RESPONSE_TEXT_2, { exact: false }),
    ).toBeVisible({ timeout: 15_000 });

    // The second response has no follow-ups, so no chips container should exist.
    await expect(page.getByTestId("follow-up-chips")).not.toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Suite 4: Chips only appear on the last message
// ---------------------------------------------------------------------------

test.describe("Follow-up chips — only on the last message", () => {
  test.use({ storageState: TEST_USERS.regular.authFile });

  test("after two exchanges, only the last assistant response shows chips", async ({
    page,
  }) => {
    // Both responses include follow-ups. After the second response arrives, only
    // the second (last) one renders chips because isLastMessage is false for the first.
    await mockChat(page, (idx) => {
      const id = `msg-${idx + 1}`;
      const text = idx === 0 ? MOCK_RESPONSE_TEXT : MOCK_RESPONSE_TEXT_2;
      return chatStream(id, text, MOCK_QUESTIONS);
    });

    await page.goto("/", { waitUntil: "networkidle" });

    // First message — chips appear on response 1.
    await sendMessage(page, "First question for chip ordering");
    await expect(page.getByTestId("follow-up-chips")).toBeVisible({
      timeout: 15_000,
    });

    // Second message — after response 2 arrives, response 1 is no longer last.
    await sendMessage(page, "Second question for chip ordering");

    // Wait for the second response text.
    await expect(
      page.getByText(MOCK_RESPONSE_TEXT_2, { exact: false }),
    ).toBeVisible({ timeout: 15_000 });

    // Exactly ONE chips container must be visible in the whole page.
    await expect(page.getByTestId("follow-up-chips")).toHaveCount(1);

    // That single chips container must contain the mock questions.
    const chipsContainer = page.getByTestId("follow-up-chips");
    await expect(chipsContainer).toBeVisible();
    for (const question of MOCK_QUESTIONS) {
      await expect(
        chipsContainer.getByRole("button", { name: question }),
      ).toBeVisible();
    }
  });
});

// ---------------------------------------------------------------------------
// Suite 5: Chips absent when follow-ups are empty or missing
// ---------------------------------------------------------------------------

test.describe("Follow-up chips — absent when follow-ups are empty", () => {
  test.use({ storageState: TEST_USERS.regular.authFile });

  test("no chips when the stream has no data-follow-ups part", async ({
    page,
  }) => {
    // Omit followUps entirely — the stream has no data-follow-ups part.
    await mockChat(page, () =>
      chatStream("msg-no-chips", MOCK_RESPONSE_TEXT, undefined),
    );
    await page.goto("/", { waitUntil: "networkidle" });

    await sendMessage(page, "A question that gets no follow-ups");

    // Wait for the response text so we know the stream finished.
    await expect(
      page.getByText(MOCK_RESPONSE_TEXT, { exact: false }),
    ).toBeVisible({ timeout: 15_000 });

    // The chips container must NOT be present — no questions, no chips.
    await expect(page.getByTestId("follow-up-chips")).not.toBeVisible();
  });

  test("no chips when data-follow-ups carries an empty questions array", async ({
    page,
  }) => {
    // Pass an empty array — the stream includes the part but with no questions.
    await mockChat(page, () =>
      chatStream("msg-empty-chips", MOCK_RESPONSE_TEXT, []),
    );
    await page.goto("/", { waitUntil: "networkidle" });

    await sendMessage(page, "A question that returns empty follow-ups");

    await expect(
      page.getByText(MOCK_RESPONSE_TEXT, { exact: false }),
    ).toBeVisible({ timeout: 15_000 });

    // Empty questions array — the component guards with questions.length > 0.
    await expect(page.getByTestId("follow-up-chips")).not.toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Suite 6: Chips absent for non-last message in thread
// ---------------------------------------------------------------------------

test.describe("Follow-up chips — non-last message has no chips", () => {
  test.use({ storageState: TEST_USERS.regular.authFile });

  test("first response loses its chips once a second response arrives", async ({
    page,
  }) => {
    // Both responses return follow-ups in the stream. After the second
    // round-trip only the last response renders chips (isLastMessage is false
    // for the first response).
    await mockChat(page, (idx) => {
      const id = `msg-thread-${idx + 1}`;
      const text = idx === 0 ? MOCK_RESPONSE_TEXT : MOCK_RESPONSE_TEXT_2;
      return chatStream(id, text, MOCK_QUESTIONS);
    });

    await page.goto("/", { waitUntil: "networkidle" });

    // Turn 1: send message, confirm chips appear.
    await sendMessage(page, "First turn — will get chips");
    await expect(
      page.getByText(MOCK_RESPONSE_TEXT, { exact: false }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("follow-up-chips")).toBeVisible({
      timeout: 10_000,
    });

    // Turn 2: send second message, first response's chips must disappear.
    await sendMessage(page, "Second turn — first response must lose its chips");
    await expect(
      page.getByText(MOCK_RESPONSE_TEXT_2, { exact: false }),
    ).toBeVisible({ timeout: 15_000 });

    // Only ONE chips container must now be visible (for the last response).
    const allChips = page.getByTestId("follow-up-chips");
    await expect(allChips).toHaveCount(1);

    // That container must display the mock questions.
    await expect(
      allChips.getByRole("button", { name: MOCK_QUESTIONS[0] }),
    ).toBeVisible();
  });

  test("first response does not have a chips container while second response does", async ({
    page,
  }) => {
    await mockChat(page, (idx) => {
      const id = `msg-dom-check-${idx + 1}`;
      const text = idx === 0 ? MOCK_RESPONSE_TEXT : MOCK_RESPONSE_TEXT_2;
      return chatStream(id, text, MOCK_QUESTIONS);
    });

    await page.goto("/", { waitUntil: "networkidle" });

    await sendMessage(page, "DOM check — turn 1");
    await expect(page.getByTestId("follow-up-chips")).toBeVisible({
      timeout: 15_000,
    });

    await sendMessage(page, "DOM check — turn 2");
    await expect(
      page.getByText(MOCK_RESPONSE_TEXT_2, { exact: false }),
    ).toBeVisible({ timeout: 15_000 });

    // After both turns: exactly one chips container in the whole page.
    await expect(page.getByTestId("follow-up-chips")).toHaveCount(1);

    // Verify that the single chips container is positioned after the second
    // response text in the DOM, not after the first response.
    const isChipsAfterSecondResponse = await page.evaluate(
      (secondTextSnippet: string) => {
        const chips = document.querySelector('[data-testid="follow-up-chips"]');
        if (!chips) return false;

        // Walk the text nodes to find one containing the snippet.
        const walker = document.createTreeWalker(
          document.body,
          NodeFilter.SHOW_TEXT,
        );
        let secondTextNode: Node | null = null;
        let node = walker.nextNode();
        while (node) {
          if (
            node.textContent &&
            node.textContent.includes(secondTextSnippet)
          ) {
            secondTextNode = node;
            break;
          }
          node = walker.nextNode();
        }
        if (!secondTextNode) return false;

        // DOCUMENT_POSITION_FOLLOWING (4): chips is after secondTextNode in DOM order.
        return !!(
          secondTextNode.compareDocumentPosition(chips) &
          Node.DOCUMENT_POSITION_FOLLOWING
        );
      },
      // Pass the first 30 chars of the second response as a unique snippet.
      MOCK_RESPONSE_TEXT_2.slice(0, 30),
    );

    expect(isChipsAfterSecondResponse).toBe(true);
  });
});
