/**
 * E2E tests for rate-limiting behaviour on POST /api/chat.
 *
 * The invariant under test: the very first request from any authenticated user
 * must never be rate-limited (429). Anonymous requests must be rejected with
 * 401 (authentication), not 429 (rate-limit).
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

test("regular user: first POST /api/chat is not rate-limited (not 429)", async ({
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

  expect(
    response.status(),
    `Regular user first request must not be rate-limited, got ${response.status()}`,
  ).not.toBe(429);

  await ctx.close();
});

test("editor user: first POST /api/chat is not rate-limited (not 429)", async ({
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

  expect(
    response.status(),
    `Editor user first request must not be rate-limited, got ${response.status()}`,
  ).not.toBe(429);

  await ctx.close();
});

test("admin user: first POST /api/chat is not rate-limited (not 429)", async ({
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

  expect(
    response.status(),
    `Admin user first request must not be rate-limited, got ${response.status()}`,
  ).not.toBe(429);

  await ctx.close();
});

test("anonymous POST /api/chat returns 401, not 429", async ({ browser }) => {
  // No storageState — unauthenticated context
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  const response = await page.request.post("/api/chat", {
    headers: { "Content-Type": "application/json" },
    data: chatBody(),
  });

  const status = response.status();
  expect(
    status,
    `Anonymous request must be rejected with 401 (auth), not 429 (rate-limit), got ${status}`,
  ).toBe(401);

  expect(
    status,
    `Anonymous request must not be rate-limited (429), got ${status}`,
  ).not.toBe(429);

  await ctx.close();
});
