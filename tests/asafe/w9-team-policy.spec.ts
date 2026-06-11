/**
 * W9 Team Policy — Playwright E2E tests
 *
 * Covers: team guardrail policy PATCH, multimodal allow-list, per-team policy
 * wiring, feedback API, prompt library API, and AUP compliance.
 *
 * Signs in via API in beforeEach to avoid depending on the parallel auth-state
 * setup project (which has race conditions under 3 concurrent workers).
 */

import { expect, test } from "@playwright/test";
import { TEST_USERS } from "../constants/test-users";

const BASE = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3001";

// ── helpers ──────────────────────────────────────────────────────────────────

async function signInViaApi(page: any, email: string, password: string) {
  const res = await page.request.post(`${BASE}/api/auth/sign-in/email`, {
    data: { email, password },
    headers: { "Content-Type": "application/json" },
  });
  expect(res.status()).toBe(200);
}

async function apiRequest(
  page: any,
  method: string,
  path: string,
  body?: unknown,
) {
  return page.request.fetch(`${BASE}${path}`, {
    method,
    data: body ? JSON.stringify(body) : undefined,
    headers: { "Content-Type": "application/json" },
  });
}

// ── state shared across tests ─────────────────────────────────────────────────

let teamId: string;

// ── tests ─────────────────────────────────────────────────────────────────────

test.describe("W9: team policy API", () => {
  // Sign in as admin before each test
  test.beforeEach(async ({ page }) => {
    await signInViaApi(page, TEST_USERS.admin.email, TEST_USERS.admin.password);
  });

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await signInViaApi(page, TEST_USERS.admin.email, TEST_USERS.admin.password);

    const res = await apiRequest(page, "POST", "/api/admin/teams", {
      name: `Policy Test ${Date.now()}`,
      slug: `policy-test-${Date.now()}`,
    });
    if (res.status() === 201 || res.status() === 200) {
      const body = await res.json();
      teamId = body.team?.id ?? body.id;
    }
    await context.close();
  });

  test("1. PATCH /api/admin/teams/[id] — 401 for unauthenticated", async ({
    page,
  }) => {
    // Explicitly sign out by clearing cookies
    await page.context().clearCookies();

    const res = await apiRequest(page, "PATCH", `/api/admin/teams/some-id`, {
      guardrailPolicy: "strict",
    });
    expect(res.status()).toBe(401);
  });

  test("2. Non-admin gets 403 on PATCH team policy", async ({ page }) => {
    // Re-sign in as regular user
    await page.context().clearCookies();
    await signInViaApi(
      page,
      TEST_USERS.regular.email,
      TEST_USERS.regular.password,
    );

    const res = await apiRequest(page, "PATCH", `/api/admin/teams/some-id`, {
      guardrailPolicy: "strict",
    });
    expect(res.status()).toBe(403);
  });

  test("3. Admin sets guardrailPolicy to strict", async ({ page }) => {
    if (!teamId) test.skip();
    const res = await apiRequest(page, "PATCH", `/api/admin/teams/${teamId}`, {
      guardrailPolicy: "strict",
    });
    expect(res.status()).toBe(200);
    expect((await res.json()).ok).toBe(true);
  });

  test("4. Admin sets guardrailPolicy to permissive", async ({ page }) => {
    if (!teamId) test.skip();
    const res = await apiRequest(page, "PATCH", `/api/admin/teams/${teamId}`, {
      guardrailPolicy: "permissive",
    });
    expect(res.status()).toBe(200);
  });

  test("5. Invalid guardrailPolicy value returns 400", async ({ page }) => {
    if (!teamId) test.skip();
    const res = await apiRequest(page, "PATCH", `/api/admin/teams/${teamId}`, {
      guardrailPolicy: "ultra-strict",
    });
    expect(res.status()).toBe(400);
  });

  test("6. Admin enables allowVision", async ({ page }) => {
    if (!teamId) test.skip();
    const res = await apiRequest(page, "PATCH", `/api/admin/teams/${teamId}`, {
      allowVision: true,
    });
    expect(res.status()).toBe(200);
  });

  test("7. Admin enables all multimodal flags simultaneously", async ({
    page,
  }) => {
    if (!teamId) test.skip();
    const res = await apiRequest(page, "PATCH", `/api/admin/teams/${teamId}`, {
      allowImageGen: true,
      allowVision: true,
      allowSpeech: true,
      guardrailPolicy: "standard",
    });
    expect(res.status()).toBe(200);
  });

  test("8. PATCH with empty body is a no-op (200)", async ({ page }) => {
    if (!teamId) test.skip();
    const res = await apiRequest(
      page,
      "PATCH",
      `/api/admin/teams/${teamId}`,
      {},
    );
    expect(res.status()).toBe(200);
  });

  test("9. GET /api/compliance/aup — 401 for unauthenticated", async ({
    page,
  }) => {
    await page.context().clearCookies();
    const res = await page.request.get(`${BASE}/api/compliance/aup`);
    expect(res.status()).toBe(401);
  });

  test("10. GET /api/compliance/aup — returns accepted boolean", async ({
    page,
  }) => {
    const res = await page.request.get(`${BASE}/api/compliance/aup`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(typeof body.accepted).toBe("boolean");
  });

  test("11. GET /api/prompts returns list", async ({ page }) => {
    const res = await page.request.get(`${BASE}/api/prompts`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body) || Array.isArray(body.prompts)).toBe(true);
  });

  test("12. POST /api/prompts creates private prompt", async ({ page }) => {
    const res = await apiRequest(page, "POST", "/api/prompts", {
      title: `Test Prompt W9 ${Date.now()}`,
      content: "You are a helpful assistant focused on {{topic}}.",
      visibility: "private",
    });
    expect([200, 201]).toContain(res.status());
  });

  test("13. POST /api/prompts creates team-scoped prompt", async ({ page }) => {
    if (!teamId) test.skip();
    const res = await apiRequest(page, "POST", "/api/prompts", {
      title: `Team Prompt W9 ${Date.now()}`,
      content: "You are the {{role}} for the {{department}} team.",
      visibility: "team",
      teamId,
    });
    expect([200, 201]).toContain(res.status());
  });

  test("14. POST /api/feedback — thumbs-up accepted", async ({ page }) => {
    const res = await apiRequest(page, "POST", "/api/feedback", {
      messageId: `msg-w9-up-${Date.now()}`,
      threadId: `thread-w9-up-${Date.now()}`,
      rating: "thumbs-up",
    });
    expect([200, 201]).toContain(res.status());
  });

  test("15. POST /api/feedback — thumbs-down with comment", async ({
    page,
  }) => {
    const res = await apiRequest(page, "POST", "/api/feedback", {
      messageId: `msg-w9-down-${Date.now()}`,
      threadId: `thread-w9-down-${Date.now()}`,
      rating: "thumbs-down",
      comment: "Response was inaccurate about EU AI Act scope.",
    });
    expect([200, 201]).toContain(res.status());
  });

  test("16. POST /api/feedback — 401 for unauthenticated", async ({ page }) => {
    await page.context().clearCookies();
    const res = await apiRequest(page, "POST", "/api/feedback", {
      messageId: "x",
      threadId: "y",
      rating: "thumbs-up",
    });
    expect(res.status()).toBe(401);
  });

  test("17. AUP modal absent after acceptance", async ({ page }) => {
    await page.goto(BASE);
    await page.waitForTimeout(1500);
    const dialog = page.getByRole("dialog", {
      name: "Conek AI — Acceptable Use Policy",
    });
    await expect(dialog).not.toBeVisible();
  });

  test("18. GET /api/admin/teams lists teams for admin", async ({ page }) => {
    const res = await page.request.get(`${BASE}/api/admin/teams`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.teams)).toBe(true);
  });
});
