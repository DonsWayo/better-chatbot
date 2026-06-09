/**
 * E2E tests for chat API auth/role access control and UI model-picker gating.
 *
 * Auth smoke tests confirm that authenticated users (any role) can reach the
 * chat endpoint without hitting a 401/403. An unauthenticated request must
 * receive a 401. Downstream errors (402, 422, 500 — AI not configured) are
 * all acceptable.
 *
 * UI tests verify that the model-selector-button is present for privileged
 * roles and absent/disabled for regular users.
 *
 * Each test creates its own browser context so the suite is parallel-safe.
 */

import { test, expect } from "@playwright/test";
import { TEST_USERS } from "../constants/test-users";

let _c = 0;
function uid(): string { _c++; return `${_c}-${process.pid}`; }

function chatBody() {
  return { id: uid(), message: { id: uid(), role: "user", parts: [{ type: "text", text: "test" }] }, toolChoice: "none" };
}

// ---------------------------------------------------------------------------
// Group 1: Chat API auth and role smoke
// ---------------------------------------------------------------------------

test.describe("Chat API auth and role smoke", () => {
  test("regular user: POST /api/chat is not blocked by auth (not 401/403)", async ({
    browser,
  }) => {
    const ctx = await browser.newContext({
      storageState: TEST_USERS.regular.authFile,
    });
    const page = await ctx.newPage();

    const response = await page.request.post("/api/chat", {
      headers: { "Content-Type": "application/json" },
      data: chatBody(),
    });

    const status = response.status();
    // 402/422/500 are acceptable — AI may not be configured in CI.
    // Only 401/403 would indicate an auth/authz block that must not happen.
    expect(
      status,
      `Regular user must not be blocked by auth; got ${status}`,
    ).not.toBe(401);
    expect(
      status,
      `Regular user must not be blocked by authz; got ${status}`,
    ).not.toBe(403);

    await ctx.close();
  });

  test("editor user: POST /api/chat is not blocked by auth (not 401/403)", async ({
    browser,
  }) => {
    const ctx = await browser.newContext({
      storageState: TEST_USERS.editor.authFile,
    });
    const page = await ctx.newPage();

    const response = await page.request.post("/api/chat", {
      headers: { "Content-Type": "application/json" },
      data: chatBody(),
    });

    const status = response.status();
    expect(
      status,
      `Editor user must not be blocked by auth; got ${status}`,
    ).not.toBe(401);
    expect(
      status,
      `Editor user must not be blocked by authz; got ${status}`,
    ).not.toBe(403);

    await ctx.close();
  });

  test("admin user: POST /api/chat is not blocked by auth (not 401/403)", async ({
    browser,
  }) => {
    const ctx = await browser.newContext({
      storageState: TEST_USERS.admin.authFile,
    });
    const page = await ctx.newPage();

    const response = await page.request.post("/api/chat", {
      headers: { "Content-Type": "application/json" },
      data: chatBody(),
    });

    const status = response.status();
    expect(
      status,
      `Admin user must not be blocked by auth; got ${status}`,
    ).not.toBe(401);
    expect(
      status,
      `Admin user must not be blocked by authz; got ${status}`,
    ).not.toBe(403);

    await ctx.close();
  });

  test("anonymous POST /api/chat returns 401", async ({ browser }) => {
    // No storageState — unauthenticated context
    const ctx = await browser.newContext();
    const page = await ctx.newPage();

    const response = await page.request.post("/api/chat", {
      headers: { "Content-Type": "application/json" },
      data: chatBody(),
    });

    expect(
      response.status(),
      `Anonymous request must be rejected with 401, got ${response.status()}`,
    ).toBe(401);

    await ctx.close();
  });

  test("regular user: POST /api/chat with explicit openrouter model is not blocked (server overrides model)", async ({
    browser,
  }) => {
    const ctx = await browser.newContext({
      storageState: TEST_USERS.regular.authFile,
    });
    const page = await ctx.newPage();

    const body = {
      ...chatBody(),
      chatModel: { provider: "openrouter", model: "gpt-5.1" },
    };

    const response = await page.request.post("/api/chat", {
      headers: { "Content-Type": "application/json" },
      data: body,
    });

    // The server is expected to silently override the requested model for
    // role=user rather than rejecting the request.
    const status = response.status();
    expect(
      status,
      `Regular user with explicit model must not be blocked by auth; got ${status}`,
    ).not.toBe(401);
    expect(
      status,
      `Regular user with explicit model must not be blocked by authz; got ${status}`,
    ).not.toBe(403);

    await ctx.close();
  });
});

// ---------------------------------------------------------------------------
// Group 2: UI model picker — role gating
// ---------------------------------------------------------------------------

test.describe("UI model picker — role gating", () => {
  test("admin at '/': model-selector-button is present", async ({ browser }) => {
    const ctx = await browser.newContext({
      storageState: TEST_USERS.admin.authFile,
    });
    const page = await ctx.newPage();
    await page.goto("/", { waitUntil: "networkidle" });

    const count = await page.getByTestId("model-selector-button").count();
    expect(
      count,
      `Admin must see at least one model-selector-button, found ${count}`,
    ).toBeGreaterThan(0);

    await ctx.close();
  });

  test("editor at '/': model-selector-button is present", async ({
    browser,
  }) => {
    const ctx = await browser.newContext({
      storageState: TEST_USERS.editor.authFile,
    });
    const page = await ctx.newPage();
    await page.goto("/", { waitUntil: "networkidle" });

    const count = await page.getByTestId("model-selector-button").count();
    expect(
      count,
      `Editor must see at least one model-selector-button, found ${count}`,
    ).toBeGreaterThan(0);

    await ctx.close();
  });

  test("regular user at '/': model-selector-button absent or disabled", async ({
    browser,
  }) => {
    const ctx = await browser.newContext({
      storageState: TEST_USERS.regular.authFile,
    });
    const page = await ctx.newPage();
    await page.goto("/", { waitUntil: "networkidle" });

    const btn = page.getByTestId("model-selector-button");
    const count = await btn.count();

    if (count === 0) {
      // Button is entirely absent — gate enforced.
      expect(count).toBe(0);
    } else {
      // Button is rendered but must be disabled.
      const isDisabled =
        (await btn.getAttribute("disabled")) !== null ||
        (await btn.getAttribute("aria-disabled")) === "true";
      expect(
        isDisabled,
        "model-selector-button is present for regular user but must be disabled",
      ).toBe(true);
    }

    await ctx.close();
  });
});
