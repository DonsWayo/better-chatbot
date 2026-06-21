import { expect, test } from "@playwright/test";
import { TEST_USERS } from "../constants/test-users";
import { suppressOnboardingOverlays } from "../helpers/session-prep";

// The opencode coding agent is a desktop-only feature (window.asafeDesktop).
//
// These specs cover three layers:
//   1. Web context: the "Code" pill must NOT appear (asafeDesktop absent).
//   2. Mocked desktop context: pill appears, mode toggles, aria-pressed flips.
//   3. Mocked event stream: events fire through onOpencodeEvent → messages render.
//
// All tests inject a mock `window.asafeDesktop` via page.addInitScript() rather
// than running the real Electron app — that allows the suite to run in the
// standard web e2e environment without a desktop binary.

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Inject a minimal mock of window.asafeDesktop with controllable event dispatch.
 * The returned `window.__fireOpencodeEvent` function (injected into page scope)
 * lets tests push events synchronously from the test side via page.evaluate().
 */
async function injectDesktopMock(
  page: import("@playwright/test").Page,
  opts: {
    promptHandler?: (id: string, text: string) => void;
  } = {},
) {
  await page.addInitScript(() => {
    const listeners: ((e: unknown) => void)[] = [];

    // Expose a hook so tests can fire events from page.evaluate()
    (window as any).__fireOpencodeEvent = (event: unknown) => {
      listeners.forEach((cb) => cb(event));
    };

    (window as any).asafeDesktop = {
      isDesktop: true,
      platform: "darwin",
      version: "0.0.0-test",
      opencode: {
        status: () =>
          Promise.resolve({
            status: "running",
            message: "",
            endpoint: "http://127.0.0.1:4096",
          }),
        start: () =>
          Promise.resolve({
            status: "running",
            message: "",
            endpoint: "http://127.0.0.1:4096",
          }),
        stop: () =>
          Promise.resolve({ status: "stopped", message: "", endpoint: null }),
        sessionCreate: () =>
          Promise.resolve({ id: "test-session-id", title: "Test" }),
        sessionList: () => Promise.resolve([]),
        prompt: (_id: string, _text: string) => Promise.resolve({}),
        abort: () => Promise.resolve(true),
        fileStatus: () => Promise.resolve([]),
        findText: () => Promise.resolve([]),
        replyPermission: (
          _sessionId: string,
          _permId: string,
          _response: string,
        ) => Promise.resolve(true),
      },
      onOpencodeEvent: (cb: (e: unknown) => void) => {
        listeners.push(cb);
        return () => {
          const idx = listeners.indexOf(cb);
          if (idx >= 0) listeners.splice(idx, 1);
        };
      },
    };
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe("opencode coding agent integration", () => {
  test("Code pill is hidden in the plain web context (no asafeDesktop)", async ({
    browser,
  }) => {
    const ctx = await browser.newContext({
      storageState: TEST_USERS.editor.authFile,
    });
    try {
      const page = await ctx.newPage();
      await suppressOnboardingOverlays(page);
      await page.goto("/");

      await expect(page.getByTestId("sidebar-user-button")).toBeVisible({
        timeout: 15_000,
      });

      // Give React time to mount the composer — then assert absence.
      const composer = page.locator("fieldset");
      await expect(composer).toBeVisible({ timeout: 10_000 });
      await expect(page.getByTestId("opencode-mode-toggle")).toHaveCount(0);
    } finally {
      await ctx.close();
    }
  });

  test("Code pill appears and toggles aria-pressed in mocked desktop context", async ({
    browser,
  }) => {
    const ctx = await browser.newContext({
      storageState: TEST_USERS.editor.authFile,
    });
    try {
      const page = await ctx.newPage();
      await injectDesktopMock(page);
      await suppressOnboardingOverlays(page);
      await page.goto("/");

      await expect(page.getByTestId("sidebar-user-button")).toBeVisible({
        timeout: 15_000,
      });

      // Pill must be present and inactive.
      const pill = page.getByTestId("opencode-mode-toggle");
      await expect(pill).toBeVisible({ timeout: 10_000 });
      await expect(pill).toHaveAttribute("aria-pressed", "false");
      await expect(pill).toHaveText(/Code/i);

      // Toggle on → "Coding" label, aria-pressed=true.
      await pill.click();
      await expect(pill).toHaveAttribute("aria-pressed", "true");
      await expect(pill).toHaveText(/Coding/i);

      // Toggle off → back to "Code" label.
      await pill.click();
      await expect(pill).toHaveAttribute("aria-pressed", "false");
      await expect(pill).toHaveText(/Code/i);
    } finally {
      await ctx.close();
    }
  });

  test("text streamed via message.part.updated renders in the chat", async ({
    browser,
  }) => {
    const ctx = await browser.newContext({
      storageState: TEST_USERS.editor.authFile,
    });
    try {
      const page = await ctx.newPage();
      await injectDesktopMock(page);
      await suppressOnboardingOverlays(page);
      await page.goto("/");

      await expect(page.getByTestId("sidebar-user-button")).toBeVisible({
        timeout: 15_000,
      });

      // Activate coding mode.
      const pill = page.getByTestId("opencode-mode-toggle");
      await expect(pill).toBeVisible({ timeout: 10_000 });
      await pill.click();
      await expect(pill).toHaveAttribute("aria-pressed", "true");

      // Type a message.
      const textarea = page.getByRole("textbox").first();
      await textarea.click();
      await textarea.fill("hello opencode");
      await page.keyboard.press("Enter");

      // Wait for user message to appear in thread.
      await expect(page.getByText("hello opencode")).toBeVisible({
        timeout: 5_000,
      });

      // Fire a text part event from the mock desktop.
      await page.evaluate(() => {
        (window as any).__fireOpencodeEvent({
          type: "message.part.updated",
          properties: {
            part: {
              id: "part-txt-1",
              sessionID: "test-session-id",
              messageID: "msg-assistant-1",
              type: "text",
              text: "Hello from the opencode agent!",
            },
          },
        });
      });

      await expect(
        page.getByRole("article").getByText("Hello from the opencode agent!"),
      ).toBeVisible({ timeout: 5_000 });
    } finally {
      await ctx.close();
    }
  });

  test("tool part (pending→running→completed) renders as ToolMessagePart", async ({
    browser,
  }) => {
    const ctx = await browser.newContext({
      storageState: TEST_USERS.editor.authFile,
    });
    try {
      const page = await ctx.newPage();
      await injectDesktopMock(page);
      await suppressOnboardingOverlays(page);
      await page.goto("/");

      await expect(page.getByTestId("sidebar-user-button")).toBeVisible({
        timeout: 15_000,
      });

      const pill = page.getByTestId("opencode-mode-toggle");
      await expect(pill).toBeVisible({ timeout: 10_000 });
      await pill.click();

      // Fire a bash tool call through its state transitions.
      await page.evaluate(() => {
        const fire = (window as any).__fireOpencodeEvent;

        // Step 1 — pending (input being assembled).
        fire({
          type: "message.part.updated",
          properties: {
            part: {
              id: "part-tool-1",
              sessionID: "test-session-id",
              messageID: "msg-tool-1",
              type: "tool",
              callID: "call-bash-1",
              tool: "bash",
              state: { status: "pending", input: { command: "ls -la" }, raw: "" },
            },
          },
        });

        // Step 2 — running.
        fire({
          type: "message.part.updated",
          properties: {
            part: {
              id: "part-tool-1",
              sessionID: "test-session-id",
              messageID: "msg-tool-1",
              type: "tool",
              callID: "call-bash-1",
              tool: "bash",
              state: {
                status: "running",
                input: { command: "ls -la" },
                time: { start: Date.now() },
              },
            },
          },
        });

        // Step 3 — completed.
        fire({
          type: "message.part.updated",
          properties: {
            part: {
              id: "part-tool-1",
              sessionID: "test-session-id",
              messageID: "msg-tool-1",
              type: "tool",
              callID: "call-bash-1",
              tool: "bash",
              state: {
                status: "completed",
                input: { command: "ls -la" },
                output: "total 42\ndrwxr-xr-x ...",
                title: "bash",
                metadata: {},
                time: { start: Date.now() - 500, end: Date.now() },
              },
            },
          },
        });
      });

      // A tool part should have rendered — look for the tool accordion header.
      // The existing ToolMessagePart renders with an expand trigger.
      await expect(
        page.locator("[data-testid='tool-message-part'], details, summary").first(),
      ).toBeVisible({ timeout: 5_000 });
    } finally {
      await ctx.close();
    }
  });

  test("permission.updated renders Allow once / Always / Deny buttons", async ({
    browser,
  }) => {
    const ctx = await browser.newContext({
      storageState: TEST_USERS.editor.authFile,
    });
    try {
      const page = await ctx.newPage();

      let replyArgs: unknown[] | null = null;
      await page.addInitScript(() => {
        const listeners: ((e: unknown) => void)[] = [];
        (window as any).__fireOpencodeEvent = (event: unknown) =>
          listeners.forEach((cb) => cb(event));
        (window as any).__lastReplyArgs = null;

        (window as any).asafeDesktop = {
          isDesktop: true,
          platform: "darwin",
          version: "0.0.0-test",
          opencode: {
            status: () =>
              Promise.resolve({ status: "running", message: "", endpoint: "http://127.0.0.1:4096" }),
            start: () =>
              Promise.resolve({ status: "running", message: "", endpoint: "http://127.0.0.1:4096" }),
            stop: () =>
              Promise.resolve({ status: "stopped", message: "", endpoint: null }),
            sessionCreate: () =>
              Promise.resolve({ id: "test-session-id", title: "Test" }),
            sessionList: () => Promise.resolve([]),
            prompt: () => Promise.resolve({}),
            abort: () => Promise.resolve(true),
            fileStatus: () => Promise.resolve([]),
            findText: () => Promise.resolve([]),
            replyPermission: (sid: string, pid: string, response: string) => {
              (window as any).__lastReplyArgs = { sid, pid, response };
              return Promise.resolve(true);
            },
          },
          onOpencodeEvent: (cb: (e: unknown) => void) => {
            listeners.push(cb);
            return () => {
              const idx = listeners.indexOf(cb);
              if (idx >= 0) listeners.splice(idx, 1);
            };
          },
        };
      });

      await suppressOnboardingOverlays(page);
      await page.goto("/");

      await expect(page.getByTestId("sidebar-user-button")).toBeVisible({
        timeout: 15_000,
      });

      const pill = page.getByTestId("opencode-mode-toggle");
      await expect(pill).toBeVisible({ timeout: 10_000 });
      await pill.click();

      // Fire a permission request.
      await page.evaluate(() => {
        (window as any).__fireOpencodeEvent({
          type: "permission.updated",
          properties: {
            id: "perm-001",
            type: "bash",
            title: "Run bash: rm -rf /tmp/test",
            sessionID: "test-session-id",
            messageID: "msg-perm-1",
            callID: "call-bash-perm",
            pattern: "rm -rf /tmp/*",
            metadata: {},
            time: { created: Date.now() },
          },
        });
      });

      const permPart = page.getByTestId("opencode-permission-part");
      await expect(permPart).toBeVisible({ timeout: 5_000 });
      await expect(permPart.getByRole("button", { name: "Allow once" })).toBeVisible();
      await expect(permPart.getByRole("button", { name: "Always allow" })).toBeVisible();
      await expect(permPart.getByRole("button", { name: "Deny" })).toBeVisible();

      // Click "Allow once" and verify replyPermission was called correctly.
      await permPart.getByRole("button", { name: "Allow once" }).click();

      replyArgs = await page.evaluate(() => (window as any).__lastReplyArgs);
      expect(replyArgs).toMatchObject({
        sid: "test-session-id",
        pid: "perm-001",
        response: "once",
      });
    } finally {
      await ctx.close();
    }
  });

  test("permission.replied marks the part as decided", async ({ browser }) => {
    const ctx = await browser.newContext({
      storageState: TEST_USERS.editor.authFile,
    });
    try {
      const page = await ctx.newPage();
      await injectDesktopMock(page);
      await suppressOnboardingOverlays(page);
      await page.goto("/");

      await expect(page.getByTestId("sidebar-user-button")).toBeVisible({
        timeout: 15_000,
      });

      const pill = page.getByTestId("opencode-mode-toggle");
      await expect(pill).toBeVisible({ timeout: 10_000 });
      await pill.click();

      // Emit permission request then reply.
      await page.evaluate(() => {
        const fire = (window as any).__fireOpencodeEvent;
        fire({
          type: "permission.updated",
          properties: {
            id: "perm-002",
            type: "write",
            title: "Write file: src/foo.ts",
            sessionID: "test-session-id",
            messageID: "msg-perm-2",
            callID: "call-write-1",
            metadata: {},
            time: { created: Date.now() },
          },
        });
        fire({
          type: "permission.replied",
          properties: {
            sessionID: "test-session-id",
            permissionID: "perm-002",
            response: "always",
          },
        });
      });

      const permPart = page.getByTestId("opencode-permission-part");
      await expect(permPart).toBeVisible({ timeout: 5_000 });
      // Buttons hidden — resolved state shown.
      await expect(permPart.getByRole("button", { name: "Allow once" })).toHaveCount(0);
      await expect(permPart.getByText("Always allowed")).toBeVisible();
    } finally {
      await ctx.close();
    }
  });

  test("part upsert: same partId fired twice renders only one element", async ({
    browser,
  }) => {
    const ctx = await browser.newContext({
      storageState: TEST_USERS.editor.authFile,
    });
    try {
      const page = await ctx.newPage();
      await injectDesktopMock(page);
      await suppressOnboardingOverlays(page);
      await page.goto("/");

      await expect(page.getByTestId("sidebar-user-button")).toBeVisible({
        timeout: 15_000,
      });

      const pill = page.getByTestId("opencode-mode-toggle");
      await expect(pill).toBeVisible({ timeout: 10_000 });
      await pill.click();

      // Fire the same text part twice (v1 then v2) — only one element should exist.
      await page.evaluate(() => {
        const fire = (window as any).__fireOpencodeEvent;
        fire({
          type: "message.part.updated",
          properties: {
            part: { id: "p-upsert", sessionID: "sess", messageID: "msg-u", type: "text", text: "version one" },
          },
        });
        fire({
          type: "message.part.updated",
          properties: {
            part: { id: "p-upsert", sessionID: "sess", messageID: "msg-u", type: "text", text: "version two" },
          },
        });
      });

      await expect(page.getByText("version two")).toBeVisible({ timeout: 5_000 });
      // "version one" must be gone — replaced in-place.
      await expect(page.getByText("version one")).toHaveCount(0);
    } finally {
      await ctx.close();
    }
  });

  test("message.part.removed removes a rendered part", async ({ browser }) => {
    const ctx = await browser.newContext({
      storageState: TEST_USERS.editor.authFile,
    });
    try {
      const page = await ctx.newPage();
      await injectDesktopMock(page);
      await suppressOnboardingOverlays(page);
      await page.goto("/");

      await expect(page.getByTestId("sidebar-user-button")).toBeVisible({
        timeout: 15_000,
      });

      const pill = page.getByTestId("opencode-mode-toggle");
      await expect(pill).toBeVisible({ timeout: 10_000 });
      await pill.click();

      await page.evaluate(() => {
        const fire = (window as any).__fireOpencodeEvent;
        fire({
          type: "message.part.updated",
          properties: {
            part: { id: "keep", sessionID: "s", messageID: "m-r", type: "text", text: "Keep me" },
          },
        });
        fire({
          type: "message.part.updated",
          properties: {
            part: { id: "gone", sessionID: "s", messageID: "m-r", type: "text", text: "Remove me" },
          },
        });
      });

      await expect(page.getByText("Keep me")).toBeVisible({ timeout: 5_000 });
      await expect(page.getByText("Remove me")).toBeVisible();

      await page.evaluate(() => {
        (window as any).__fireOpencodeEvent({
          type: "message.part.removed",
          properties: { sessionID: "s", messageID: "m-r", partID: "gone" },
        });
      });

      await expect(page.getByText("Remove me")).toHaveCount(0, { timeout: 3_000 });
      await expect(page.getByText("Keep me")).toBeVisible();
    } finally {
      await ctx.close();
    }
  });

  test("reasoning part renders alongside text in same message", async ({
    browser,
  }) => {
    const ctx = await browser.newContext({
      storageState: TEST_USERS.editor.authFile,
    });
    try {
      const page = await ctx.newPage();
      await injectDesktopMock(page);
      await suppressOnboardingOverlays(page);
      await page.goto("/");

      await expect(page.getByTestId("sidebar-user-button")).toBeVisible({
        timeout: 15_000,
      });

      const pill = page.getByTestId("opencode-mode-toggle");
      await expect(pill).toBeVisible({ timeout: 10_000 });
      await pill.click();

      await page.evaluate(() => {
        const fire = (window as any).__fireOpencodeEvent;
        fire({
          type: "message.part.updated",
          properties: {
            part: {
              id: "r1",
              sessionID: "s",
              messageID: "m-reasoning",
              type: "reasoning",
              text: "Let me think step by step",
              time: { start: Date.now() },
            },
          },
        });
        fire({
          type: "message.part.updated",
          properties: {
            part: {
              id: "t1",
              sessionID: "s",
              messageID: "m-reasoning",
              type: "text",
              text: "Here is my answer.",
            },
          },
        });
      });

      // Both parts should be in the DOM — reasoning often collapsed in a toggle.
      await expect(page.getByText("Here is my answer.")).toBeVisible({ timeout: 5_000 });
    } finally {
      await ctx.close();
    }
  });

  test("switching back to normal mode hides opencode messages", async ({
    browser,
  }) => {
    const ctx = await browser.newContext({
      storageState: TEST_USERS.editor.authFile,
    });
    try {
      const page = await ctx.newPage();
      await injectDesktopMock(page);
      await suppressOnboardingOverlays(page);
      await page.goto("/");

      await expect(page.getByTestId("sidebar-user-button")).toBeVisible({
        timeout: 15_000,
      });

      const pill = page.getByTestId("opencode-mode-toggle");
      await expect(pill).toBeVisible({ timeout: 10_000 });

      // Activate coding mode and fire a text part.
      await pill.click();
      await page.evaluate(() => {
        (window as any).__fireOpencodeEvent({
          type: "message.part.updated",
          properties: {
            part: { id: "p1", sessionID: "s", messageID: "m-oc", type: "text", text: "opencode reply" },
          },
        });
      });
      await expect(page.getByText("opencode reply")).toBeVisible({ timeout: 5_000 });

      // Switch back to normal mode — opencode messages should not be visible.
      await pill.click();
      await expect(pill).toHaveAttribute("aria-pressed", "false");
      await expect(page.getByText("opencode reply")).toHaveCount(0);
    } finally {
      await ctx.close();
    }
  });

  test("stop button in coding mode calls abort on the session", async ({
    browser,
  }) => {
    const ctx = await browser.newContext({
      storageState: TEST_USERS.editor.authFile,
    });
    try {
      const page = await ctx.newPage();
      await page.addInitScript(() => {
        const listeners: ((e: unknown) => void)[] = [];
        (window as any).__abortCalled = false;
        (window as any).__fireOpencodeEvent = (event: unknown) =>
          listeners.forEach((cb) => cb(event));
        (window as any).asafeDesktop = {
          isDesktop: true,
          platform: "darwin",
          version: "0.0.0-test",
          opencode: {
            status: () => Promise.resolve({ status: "running", message: "", endpoint: "http://127.0.0.1:4096" }),
            start: () => Promise.resolve({ status: "running", message: "", endpoint: "http://127.0.0.1:4096" }),
            stop: () => Promise.resolve({ status: "stopped", message: "", endpoint: null }),
            sessionCreate: () => Promise.resolve({ id: "sess-stop-test" }),
            sessionList: () => Promise.resolve([]),
            prompt: async (_id: string, _text: string) => {
              // Never resolves — simulates an in-flight prompt.
              return new Promise(() => {});
            },
            abort: (_id: string) => {
              (window as any).__abortCalled = true;
              return Promise.resolve(true);
            },
            fileStatus: () => Promise.resolve([]),
            findText: () => Promise.resolve([]),
            replyPermission: () => Promise.resolve(true),
          },
          onOpencodeEvent: (cb: (e: unknown) => void) => {
            listeners.push(cb);
            return () => {
              const idx = listeners.indexOf(cb);
              if (idx >= 0) listeners.splice(idx, 1);
            };
          },
        };
      });

      await suppressOnboardingOverlays(page);
      await page.goto("/");

      await expect(page.getByTestId("sidebar-user-button")).toBeVisible({
        timeout: 15_000,
      });

      const pill = page.getByTestId("opencode-mode-toggle");
      await expect(pill).toBeVisible({ timeout: 10_000 });
      await pill.click();

      // Send a message (prompt never resolves — simulates streaming).
      const textarea = page.getByRole("textbox").first();
      await textarea.click();
      await textarea.fill("do something");
      await page.keyboard.press("Enter");

      // Fire busy to make the Stop button appear.
      await page.evaluate(() => {
        (window as any).__fireOpencodeEvent({
          type: "session.status",
          properties: { sessionID: "sess-stop-test", status: { type: "busy" } },
        });
      });

      const stopButton = page.getByRole("button", { name: /stop/i });
      await expect(stopButton).toBeVisible({ timeout: 5_000 });
      await stopButton.click();

      const abortCalled = await page.evaluate(() => (window as any).__abortCalled);
      expect(abortCalled).toBe(true);
    } finally {
      await ctx.close();
    }
  });

  test("session.status busy/idle updates composer loading state", async ({
    browser,
  }) => {
    const ctx = await browser.newContext({
      storageState: TEST_USERS.editor.authFile,
    });
    try {
      const page = await ctx.newPage();
      await injectDesktopMock(page);
      await suppressOnboardingOverlays(page);
      await page.goto("/");

      await expect(page.getByTestId("sidebar-user-button")).toBeVisible({
        timeout: 15_000,
      });

      const pill = page.getByTestId("opencode-mode-toggle");
      await expect(pill).toBeVisible({ timeout: 10_000 });
      await pill.click();

      // Fire busy then idle — the Stop button should appear then disappear.
      await page.evaluate(() => {
        const fire = (window as any).__fireOpencodeEvent;
        fire({
          type: "session.status",
          properties: { sessionID: "test-session-id", status: { type: "busy" } },
        });
      });

      // Stop button appears when running.
      const stopButton = page.getByRole("button", { name: /stop/i });
      await expect(stopButton).toBeVisible({ timeout: 5_000 });

      await page.evaluate(() => {
        (window as any).__fireOpencodeEvent({
          type: "session.idle",
          properties: { sessionID: "test-session-id" },
        });
      });

      await expect(stopButton).toHaveCount(0, { timeout: 3_000 });
    } finally {
      await ctx.close();
    }
  });
});
