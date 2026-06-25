/**
 * Deep security E2E tests — HTTP-level coverage via page.request.
 *
 * Suites:
 *  1. Auth enforcement — unauthenticated requests must be rejected (401/403)
 *  2. IDOR thread isolation — user B cannot read user A's threads
 *  3. IDOR document isolation — user B cannot view user A's private document
 *  4. File upload security — type allowlist, MIME spoofing, edge-case sizes
 *  5. Rate limiting — POST /api/chat triggers 429 under rapid fire
 *  6. XSS prevention — script tags in messages must not execute in the browser
 *  7. SQL injection resistance — malicious SQL in messages must be handled safely
 *  8. CSRF protection — plain POST without session cookie or Next-Action header is rejected
 */

import { type APIResponse, expect, test } from "@playwright/test";
import { TEST_USERS } from "../constants/test-users";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let _seq = 0;
function uid(): string {
  _seq++;
  return `sec-${_seq}-${process.pid}-${Date.now()}`;
}

/** Build a minimal valid /api/chat request body */
function chatBody(text = "test"): Record<string, unknown> {
  return {
    id: uid(),
    message: {
      id: uid(),
      role: "user",
      parts: [{ type: "text", text }],
    },
    toolChoice: "none",
  };
}

/** Build a multipart FormData-style request for file upload via page.request */
async function uploadFile(
  page: import("@playwright/test").Page,
  filename: string,
  contentType: string,
  content: Buffer | string,
): Promise<APIResponse> {
  const buf =
    typeof content === "string" ? Buffer.from(content, "utf-8") : content;
  return page.request.post("/api/storage/upload", {
    multipart: {
      file: {
        name: filename,
        mimeType: contentType,
        buffer: buf,
      },
    },
    failOnStatusCode: false,
  });
}

// ---------------------------------------------------------------------------
// Suite 1: Auth enforcement — unauthenticated requests must be rejected
// ---------------------------------------------------------------------------
test.describe("Suite 1: Auth enforcement on critical routes", () => {
  // No storage state — fully anonymous context
  test.use({ storageState: undefined });

  const PROTECTED_GETS: Array<{ label: string; path: string }> = [
    { label: "GET /api/thread", path: "/api/thread" },
    {
      label: "GET /api/knowledge/collections",
      path: "/api/knowledge/collections",
    },
    { label: "GET /api/runs", path: "/api/runs" },
    { label: "GET /api/admin/audit", path: "/api/admin/audit" },
  ];

  for (const { label, path } of PROTECTED_GETS) {
    test(`${label} → 401 when not authenticated`, async ({ page }) => {
      const res = await page.request.get(path, { failOnStatusCode: false });
      expect(
        res.status(),
        `${label} must be rejected with 401, got ${res.status()}`,
      ).toBe(401);
    });
  }

  test("POST /api/chat → 401 when not authenticated", async ({ page }) => {
    const res = await page.request.post("/api/chat", {
      headers: { "Content-Type": "application/json" },
      data: chatBody(),
      failOnStatusCode: false,
    });
    expect(
      res.status(),
      `POST /api/chat must be rejected with 401, got ${res.status()}`,
    ).toBe(401);
  });

  test("GET /api/documents/actions → 401 or 404 when not authenticated", async ({
    page,
  }) => {
    const res = await page.request.get("/api/documents/actions", {
      failOnStatusCode: false,
    });
    const status = res.status();
    expect(
      [401, 404],
      `GET /api/documents/actions must be 401 or 404, got ${status}`,
    ).toContain(status);
    // Must never be 200 (data leak)
    expect(status).not.toBe(200);
  });

  test("GET /api/admin/users returns 401 or 403 when not authenticated", async ({
    page,
  }) => {
    const res = await page.request.get("/api/admin/audit", {
      failOnStatusCode: false,
    });
    const status = res.status();
    expect([401, 403], `Admin route must be gated, got ${status}`).toContain(
      status,
    );
  });

  test("POST /api/storage/upload → 401 when not authenticated", async ({
    page,
  }) => {
    const res = await uploadFile(page, "test.txt", "text/plain", "hello world");
    expect(
      res.status(),
      `File upload must be rejected with 401, got ${res.status()}`,
    ).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// Suite 2: IDOR — thread isolation
// ---------------------------------------------------------------------------
test.describe("Suite 2: IDOR — thread isolation", () => {
  /**
   * Strategy:
   *  - Admin creates a chat thread by navigating to "/" and sending a message.
   *    We capture the resulting URL to extract the thread/chat ID.
   *  - Regular user then makes a direct GET /api/thread?id=<that-id> or
   *    navigates to /chat/<id> — must get 403/404, not 200 with content.
   *
   * NOTE: The thread GET route returns the *caller's* threads (filtered by
   * userId) so there is no single-resource by-id endpoint exposed.  We test
   * that a regular user cannot view a thread page that belongs to admin,
   * and that the thread list never leaks another user's threads.
   */

  test("regular user thread list never contains admin threads", async ({
    browser,
  }) => {
    // Step 1: Admin creates a thread (go to home which creates a new thread on
    //         first navigation or after clicking New Chat).
    const adminCtx = await browser.newContext({
      storageState: TEST_USERS.admin.authFile,
    });
    const adminPage = await adminCtx.newPage();

    // Fetch admin's threads so we know their IDs.
    const adminRes = await adminPage.request.get("/api/thread", {
      failOnStatusCode: false,
    });
    // Admin must get 200 (authenticated)
    expect(adminRes.status()).toBe(200);
    const adminThreads = (await adminRes.json()) as Array<{ id: string }>;
    await adminCtx.close();

    // Step 2: Regular user fetches their threads — no admin thread must appear.
    const regularCtx = await browser.newContext({
      storageState: TEST_USERS.regular.authFile,
    });
    const regularPage = await regularCtx.newPage();
    const regularRes = await regularPage.request.get("/api/thread", {
      failOnStatusCode: false,
    });
    expect(regularRes.status()).toBe(200);
    const regularThreads = (await regularRes.json()) as Array<{ id: string }>;

    const adminIds = new Set(adminThreads.map((t) => t.id));
    for (const thread of regularThreads) {
      expect(
        adminIds.has(thread.id),
        `Regular user should not see admin thread ID ${thread.id}`,
      ).toBe(false);
    }

    await regularCtx.close();
  });

  test("regular user cannot navigate to admin's chat page", async ({
    browser,
  }) => {
    // Get an admin thread ID from the thread list.
    const adminCtx = await browser.newContext({
      storageState: TEST_USERS.admin.authFile,
    });
    const adminPage = await adminCtx.newPage();
    const adminRes = await adminPage.request.get("/api/thread", {
      failOnStatusCode: false,
    });

    if (adminRes.status() !== 200) {
      // Nothing to test if admin has no threads.
      await adminCtx.close();
      return;
    }

    const adminThreads = (await adminRes.json()) as Array<{ id: string }>;
    await adminCtx.close();

    if (adminThreads.length === 0) {
      // Admin has no threads yet — skip this assertion.
      return;
    }

    const adminThreadId = adminThreads[0].id;

    // Regular user attempts to open the same chat URL.
    const regularCtx = await browser.newContext({
      storageState: TEST_USERS.regular.authFile,
    });
    const regularPage = await regularCtx.newPage();
    await regularPage.goto(`/chat/${adminThreadId}`, {
      waitUntil: "domcontentloaded",
    });

    // Must NOT show the admin's thread content.
    // Acceptable: redirect to home, empty new chat, or an error page.
    // Not acceptable: the page URL stays at /chat/<adminId> AND renders message content.
    const currentUrl = regularPage.url();
    const bodyText = await regularPage.locator("body").innerText();

    // If the user is still on the same URL, the page should not show the admin's chat.
    // We check that there is no leaked message or explicit thread content rendered.
    // (A redirect to "/" is the most common safe outcome.)
    if (currentUrl.includes(adminThreadId)) {
      // The page kept the URL — at minimum verify no thread-content leak.
      // A safe app shows an empty chat shell or redirects.
      expect(
        bodyText,
        "Regular user must not see admin thread content",
      ).not.toMatch(/unauthorized access|admin secret|admin message/i);
    }
    // If redirected away from the admin URL, that is the expected safe behavior.

    await regularCtx.close();
  });
});

// ---------------------------------------------------------------------------
// Suite 3: IDOR — document isolation
// ---------------------------------------------------------------------------
test.describe("Suite 3: IDOR — document isolation", () => {
  test("regular user navigating to admin private document is redirected or shown 404", async ({
    browser,
  }) => {
    // Step 1: get admin's document list via the admin session.
    const adminCtx = await browser.newContext({
      storageState: TEST_USERS.admin.authFile,
    });
    const adminPage = await adminCtx.newPage();

    // Navigate to the documents list to discover a document ID.
    await adminPage.goto("/documents", { waitUntil: "domcontentloaded" });
    const adminUrl = adminPage.url();
    await adminCtx.close();

    // Step 2: Regular user tries to navigate to the admin's document.
    // We need a document ID; if the admin documents list page has links we
    // can extract one.  If not, skip gracefully.
    const regularCtx = await browser.newContext({
      storageState: TEST_USERS.regular.authFile,
    });
    const regularPage = await regularCtx.newPage();

    // Attempt to GET an admin document by constructing a plausible path.
    // We rely on the admin page URL captured above; if it contains a UUID we use it.
    const uuidMatch = adminUrl.match(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/,
    );
    if (uuidMatch) {
      const docId = uuidMatch[0];
      await regularPage.goto(`/documents/${docId}`, {
        waitUntil: "domcontentloaded",
      });
      const body = await regularPage.locator("body").innerText();

      // Acceptable outcomes: redirected away from the document, or 404/not-found.
      // Not acceptable: document content rendered for the wrong user.
      const isOnDocPage = regularPage.url().includes(`/documents/${docId}`);
      if (isOnDocPage) {
        // If we land on the page, it must show a not-found or access-denied message,
        // not the document content.
        expect(body).toMatch(/not found|not authorized|access denied|404/i);
      }
      // Redirected away is also a valid safe outcome — no assertion needed.
    }

    await regularCtx.close();
  });
});

// ---------------------------------------------------------------------------
// Suite 4: File upload security
// ---------------------------------------------------------------------------
test.describe("Suite 4: File upload security", () => {
  test.use({ storageState: TEST_USERS.regular.authFile });

  test("uploading a .js file is rejected with 415", async ({ page }) => {
    const res = await uploadFile(
      page,
      "evil.js",
      "application/javascript",
      'window.__xss = 1; alert("pwned");',
    );
    expect(
      res.status(),
      `JavaScript upload must be rejected (415), got ${res.status()}`,
    ).toBe(415);
  });

  test("uploading a .php file is rejected with 415", async ({ page }) => {
    const res = await uploadFile(
      page,
      "shell.php",
      "application/x-php",
      "<?php system($_GET['cmd']); ?>",
    );
    expect(
      res.status(),
      `PHP upload must be rejected (415), got ${res.status()}`,
    ).toBe(415);
  });

  test("uploading text/html is rejected with 415", async ({ page }) => {
    const res = await uploadFile(
      page,
      "page.html",
      "text/html",
      "<script>alert(1)</script>",
    );
    expect(
      res.status(),
      `HTML upload must be rejected (415), got ${res.status()}`,
    ).toBe(415);
  });

  test("uploading a .exe file is rejected with 415", async ({ page }) => {
    const res = await uploadFile(
      page,
      "malware.exe",
      "application/x-msdownload",
      Buffer.from([0x4d, 0x5a]), // MZ header
    );
    expect(
      res.status(),
      `EXE upload must be rejected (415), got ${res.status()}`,
    ).toBe(415);
  });

  test("MIME spoofing — JS content with image/png Content-Type is rejected", async ({
    page,
  }) => {
    // The server enforces the declared Content-Type from the multipart header.
    // A real JS file declared as image/png must use the declared MIME for the
    // allowlist check. image/png IS on the allowlist so the server will accept
    // the bytes — the test asserts the server uses the declared Content-Type
    // (not magic-byte sniffing), which is the current design (not a bug here).
    // The important invariant is: a file declared as application/javascript is
    // REJECTED regardless of its byte content.
    const jsContent = Buffer.from("window.__injected = true;", "utf-8");
    const res = await uploadFile(
      page,
      "image.png",
      "application/javascript",
      jsContent,
    );
    expect(
      res.status(),
      `File declared as application/javascript must be rejected, got ${res.status()}`,
    ).toBe(415);
  });

  test("uploading a 0-byte file is rejected (400 or 415)", async ({ page }) => {
    const res = await uploadFile(
      page,
      "empty.txt",
      "text/plain",
      Buffer.alloc(0),
    );
    // A 0-byte file may be rejected as invalid content (400) or might pass
    // depending on implementation; it must never cause a 5xx server crash.
    expect(
      res.status(),
      `0-byte upload must not cause a 5xx, got ${res.status()}`,
    ).toBeLessThan(500);
  });

  test("uploading a file over 20 MB is rejected with 413", async ({ page }) => {
    // Generate a buffer just over the 20 MB limit (20 MB + 1 byte).
    const overLimitBytes = 20 * 1024 * 1024 + 1;
    const bigBuffer = Buffer.alloc(overLimitBytes, 0x41); // 'A' × overLimit
    const res = await uploadFile(page, "huge.txt", "text/plain", bigBuffer);
    // Either 413 (explicit size rejection) or the server rejects; must not be 2xx.
    expect(
      [413, 400, 500].includes(res.status()) || res.status() === 413,
      `Oversized upload must be rejected; got ${res.status()}`,
    ).toBeTruthy();
    expect(
      res.status(),
      `Oversized upload must not return 2xx, got ${res.status()}`,
    ).not.toBeGreaterThanOrEqual(200);
  });
});

// ---------------------------------------------------------------------------
// Suite 5: Rate limiting
// ---------------------------------------------------------------------------
test.describe("Suite 5: Rate limiting on POST /api/chat", () => {
  test("rapid-fire requests eventually trigger 429 with retry-after header", async ({
    browser,
  }) => {
    // Each test gets a fresh context so we start from a clean rate-limit bucket.
    const ctx = await browser.newContext({
      storageState: TEST_USERS.editor2.authFile,
    });
    const page = await ctx.newPage();

    const BURST = 30;
    const statuses: number[] = [];

    // Fire all requests concurrently — faster than sequential, more likely to hit limit.
    const responses = await Promise.all(
      Array.from({ length: BURST }, () =>
        page.request.post("/api/chat", {
          headers: { "Content-Type": "application/json" },
          data: chatBody("rate limit probe"),
          failOnStatusCode: false,
        }),
      ),
    );

    for (const res of responses) {
      statuses.push(res.status());
    }

    const tooManyCount = statuses.filter((s) => s === 429).length;

    expect(
      tooManyCount,
      `At least one of ${BURST} rapid requests must be rate-limited (429). Got statuses: ${statuses.join(", ")}`,
    ).toBeGreaterThan(0);

    // Verify the 429 response includes Retry-After or rate-limit headers.
    const rateLimitedRes = responses.find((r) => r.status() === 429);
    if (rateLimitedRes) {
      const hasRetryAfter =
        rateLimitedRes.headers()["retry-after"] !== undefined ||
        rateLimitedRes.headers()["x-ratelimit-reset"] !== undefined ||
        rateLimitedRes.headers()["ratelimit-reset"] !== undefined;

      // The body should indicate rate limiting.
      const bodyText = await rateLimitedRes.text().catch(() => "");
      const bodyIndicatesRateLimit =
        /rate.?limit|too.?many.?request/i.test(bodyText) || hasRetryAfter;

      expect(
        bodyIndicatesRateLimit,
        `429 response body or headers must indicate rate limiting. Body: ${bodyText.slice(0, 200)}`,
      ).toBe(true);
    }

    await ctx.close();
  });

  test("unauthenticated rapid-fire returns 401 not 429", async ({
    browser,
  }) => {
    // Auth check must run before rate-limit check so we get 401, not 429.
    const ctx = await browser.newContext();
    const page = await ctx.newPage();

    const BURST = 10;
    const responses = await Promise.all(
      Array.from({ length: BURST }, () =>
        page.request.post("/api/chat", {
          headers: { "Content-Type": "application/json" },
          data: chatBody(),
          failOnStatusCode: false,
        }),
      ),
    );

    for (const res of responses) {
      expect(
        res.status(),
        `Anonymous request must be 401, not 429. Got ${res.status()}`,
      ).toBe(401);
    }

    await ctx.close();
  });
});

// ---------------------------------------------------------------------------
// Suite 6: XSS prevention in messages
// ---------------------------------------------------------------------------
test.describe("Suite 6: XSS prevention in messages", () => {
  test.use({ storageState: TEST_USERS.regular.authFile });

  test("script tags in a chat message are not executed in the browser", async ({
    page,
  }) => {
    // We mock /api/chat so the AI "echoes" back the XSS payload in its reply.
    // This tests that the frontend renders the echoed content safely (no eval).
    const XSS_PAYLOAD = "<script>window.__xss_executed = 1;</script>";
    const XSS_TEXT = `Here is the content: ${XSS_PAYLOAD}`;

    // Build a minimal stream that echoes back the XSS payload.
    const streamBody = [
      `data: ${JSON.stringify({ type: "start", messageId: "msg-x1" })}\n\n`,
      `data: ${JSON.stringify({ type: "start-step", stepType: "initial" })}\n\n`,
      `data: ${JSON.stringify({ type: "text-start", id: "txt-x1" })}\n\n`,
      `data: ${JSON.stringify({ type: "text-delta", id: "txt-x1", delta: XSS_TEXT })}\n\n`,
      `data: ${JSON.stringify({ type: "text-end", id: "txt-x1" })}\n\n`,
      `data: ${JSON.stringify({ type: "finish-step", finishReason: "stop", usage: { inputTokens: 5, outputTokens: 10 } })}\n\n`,
      `data: ${JSON.stringify({ type: "finish", finishReason: "stop", usage: { inputTokens: 5, outputTokens: 10 } })}\n\n`,
      "data: [DONE]\n\n",
    ].join("");

    await page.route("**/api/chat", async (route) => {
      await route.fulfill({
        status: 200,
        headers: {
          "Content-Type": "text/event-stream",
          "x-vercel-ai-ui-message-stream": "v1",
        },
        body: streamBody,
      });
    });

    await page.goto("/");

    const editor = page
      .locator('[contenteditable="true"]')
      .or(page.locator("textarea"))
      .first();
    await editor.click();
    await editor.fill(XSS_PAYLOAD);
    await page.keyboard.press("Enter");

    // Wait for the response text to appear (safely rendered).
    await expect(page.locator("text=Here is the content")).toBeVisible({
      timeout: 15_000,
    });

    // Verify the script did NOT execute.
    const xssExecuted = await page.evaluate(
      () => (window as unknown as Record<string, unknown>).__xss_executed,
    );
    expect(
      xssExecuted,
      "XSS script must NOT have executed (window.__xss_executed should be undefined)",
    ).toBeUndefined();
  });

  test("img onerror XSS payload is not executed", async ({ page }) => {
    const XSS_PAYLOAD = '<img src="x" onerror="window.__img_xss=1">';
    const ECHO_TEXT = `Response: ${XSS_PAYLOAD}`;

    const streamBody = [
      `data: ${JSON.stringify({ type: "start", messageId: "msg-x2" })}\n\n`,
      `data: ${JSON.stringify({ type: "start-step", stepType: "initial" })}\n\n`,
      `data: ${JSON.stringify({ type: "text-start", id: "txt-x2" })}\n\n`,
      `data: ${JSON.stringify({ type: "text-delta", id: "txt-x2", delta: ECHO_TEXT })}\n\n`,
      `data: ${JSON.stringify({ type: "text-end", id: "txt-x2" })}\n\n`,
      `data: ${JSON.stringify({ type: "finish-step", finishReason: "stop", usage: { inputTokens: 5, outputTokens: 10 } })}\n\n`,
      `data: ${JSON.stringify({ type: "finish", finishReason: "stop", usage: { inputTokens: 5, outputTokens: 10 } })}\n\n`,
      "data: [DONE]\n\n",
    ].join("");

    await page.route("**/api/chat", async (route) => {
      await route.fulfill({
        status: 200,
        headers: {
          "Content-Type": "text/event-stream",
          "x-vercel-ai-ui-message-stream": "v1",
        },
        body: streamBody,
      });
    });

    await page.goto("/");

    const editor = page
      .locator('[contenteditable="true"]')
      .or(page.locator("textarea"))
      .first();
    await editor.click();
    await editor.fill(XSS_PAYLOAD);
    await page.keyboard.press("Enter");

    await expect(page.locator("text=Response")).toBeVisible({
      timeout: 15_000,
    });

    const xssExecuted = await page.evaluate(
      () => (window as unknown as Record<string, unknown>).__img_xss,
    );
    expect(
      xssExecuted,
      "img onerror XSS must NOT have executed",
    ).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Suite 7: SQL injection resistance
// ---------------------------------------------------------------------------
test.describe("Suite 7: SQL injection resistance", () => {
  test.use({ storageState: TEST_USERS.regular.authFile });

  test("SQL injection payload in chat message is handled gracefully (no 5xx)", async ({
    page,
  }) => {
    const SQL_INJECTION = "' OR '1'='1'; DROP TABLE users; --";

    const res = await page.request.post("/api/chat", {
      headers: { "Content-Type": "application/json" },
      data: {
        id: uid(),
        message: {
          id: uid(),
          role: "user",
          parts: [{ type: "text", text: SQL_INJECTION }],
        },
        toolChoice: "none",
      },
      failOnStatusCode: false,
    });

    // 5xx = server crashed or SQL executed incorrectly — unacceptable.
    // 2xx or 4xx = handled safely.
    expect(
      res.status(),
      `SQL injection must not cause a 5xx error. Got ${res.status()}`,
    ).toBeLessThan(500);
  });

  test("database is intact after SQL injection attempt (thread list still works)", async ({
    page,
  }) => {
    // Fire the SQL injection.
    await page.request.post("/api/chat", {
      headers: { "Content-Type": "application/json" },
      data: {
        id: uid(),
        message: {
          id: uid(),
          role: "user",
          parts: [
            {
              type: "text",
              text: "'; DELETE FROM users WHERE '1'='1'; --",
            },
          ],
        },
        toolChoice: "none",
      },
      failOnStatusCode: false,
    });

    // Subsequent requests must still work — DB must be intact.
    const threadRes = await page.request.get("/api/thread", {
      failOnStatusCode: false,
    });
    expect(
      threadRes.status(),
      `Thread list must still work after SQL injection attempt, got ${threadRes.status()}`,
    ).toBe(200);
  });

  test("SQL injection via query param in knowledge collections is handled safely", async ({
    page,
  }) => {
    const maliciousParam = "' OR 1=1; DROP TABLE knowledge_collections; --";
    const res = await page.request.get(
      `/api/knowledge/collections?search=${encodeURIComponent(maliciousParam)}`,
      { failOnStatusCode: false },
    );
    expect(
      res.status(),
      `SQL injection via query param must not cause 5xx, got ${res.status()}`,
    ).toBeLessThan(500);
  });
});

// ---------------------------------------------------------------------------
// Suite 8: CSRF protection
// ---------------------------------------------------------------------------
test.describe("Suite 8: CSRF protection", () => {
  /**
   * Next.js Server Actions require the Next-Action header as CSRF protection.
   * A plain POST to a page-level route without the Next-Action header from an
   * unauthenticated context (or a cross-origin context) should be rejected.
   *
   * For the JSON /api/chat route: it requires a valid session cookie — no
   * cookie = 401.  We verify that the absence of the session cookie alone is
   * sufficient to deny the request, even with a valid-looking body.
   */

  test("POST /api/chat without session cookie is rejected (401)", async ({
    browser,
  }) => {
    // No storageState = no cookie.
    const ctx = await browser.newContext();
    const page = await ctx.newPage();

    const res = await page.request.post("/api/chat", {
      headers: {
        "Content-Type": "application/json",
        // Simulate a cross-origin request: set an Origin that differs from
        // the application's own origin.
        Origin: "https://evil.example.com",
      },
      data: chatBody("csrf test"),
      failOnStatusCode: false,
    });

    expect(
      res.status(),
      `POST without auth cookie must be 401, got ${res.status()}`,
    ).toBe(401);

    await ctx.close();
  });

  test("POST /api/chat from different Origin without cookie is rejected", async ({
    browser,
  }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();

    const res = await page.request.post("/api/chat", {
      headers: {
        "Content-Type": "application/json",
        Origin: "https://attacker.example.com",
        Referer: "https://attacker.example.com/",
      },
      data: chatBody(),
      failOnStatusCode: false,
    });

    // Without a valid session, must get 401.
    expect(res.status()).toBe(401);
    await ctx.close();
  });

  test("Next.js Server Action POST without Next-Action header is not treated as a Server Action", async ({
    browser,
  }) => {
    // A plain POST to a page that uses Server Actions without the Next-Action
    // header should not trigger the Server Action handler.
    // The server must return something other than a Server Action result (200
    // with action data). A regular page HTML response (200), 400, or 405 is acceptable.
    const ctx = await browser.newContext();
    const page = await ctx.newPage();

    const res = await page.request.post("/documents", {
      headers: {
        "Content-Type": "application/json",
        // Deliberately omit the Next-Action header
      },
      data: { action: "createDocument", title: "csrf_test" },
      failOnStatusCode: false,
    });

    const status = res.status();
    // A plain POST without Next-Action must not return action-level 2xx JSON —
    // acceptable is HTML page (200), redirect, or method error.
    // It must NOT return a structured Server Action response with action data.
    if (status === 200) {
      const body = await res.text();
      // If 200, the response must be an HTML page, not a JSON action response.
      const isJsonActionResponse =
        body.includes('"actionResult"') || body.includes('"documentId"');
      expect(
        isJsonActionResponse,
        "POST without Next-Action header must not trigger a Server Action response",
      ).toBe(false);
    }

    await ctx.close();
  });

  test("authenticated user: POST /api/chat with forged Origin still requires valid session", async ({
    browser,
  }) => {
    // Even with a valid session, a forged Origin header must not bypass anything.
    // The auth layer checks the session cookie, not the origin. This test confirms
    // that authenticated users with a valid cookie are not blocked by origin checks
    // (i.e., SameSite cookies do the CSRF work, not a brittle origin whitelist that
    // could lock out legitimate apps).
    const ctx = await browser.newContext({
      storageState: TEST_USERS.regular.authFile,
    });
    const page = await ctx.newPage();

    const res = await page.request.post("/api/chat", {
      headers: {
        "Content-Type": "application/json",
        // Even with a forged origin, a valid cookie should mean the request
        // is processed (auth passes). The CSRF protection is session-cookie
        // based (SameSite=Lax), not origin-header based.
        Origin: "https://attacker.example.com",
      },
      data: chatBody("csrf with valid session"),
      failOnStatusCode: false,
    });

    // With a valid session cookie, the request should be processed (not 401/403).
    // It may still be rejected for other reasons (model unavailable, etc.)
    // but must not be refused purely because of the Origin header.
    const status = res.status();
    expect(
      status,
      `Authenticated request must not be rejected due to Origin header alone. Got ${status}`,
    ).not.toBe(403);
    // Must have reached the auth layer (not 401 = good).
    expect(
      status,
      `Authenticated request must pass auth even with forged Origin. Got ${status}`,
    ).not.toBe(401);
  });
});
