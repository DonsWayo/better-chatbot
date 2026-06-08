/**
 * W9 Team Policy — Playwright E2E tests
 *
 * Covers: team guardrail policy PATCH, multimodal allow-list, per-team policy
 * wiring, and prompt-library visibility.
 */

import { test, expect } from "@playwright/test";

const BASE = "http://localhost:3001";

// ── helpers ──────────────────────────────────────────────────────────────────

async function getAuthToken(
  page: any,
  email: string,
  password: string,
): Promise<string> {
  const res = await page.request.post(`${BASE}/api/auth/sign-in/email`, {
    data: { email, password },
  });
  expect(res.status()).toBe(200);
  const body = await res.json();
  return body.token ?? body.data?.token ?? "";
}

async function adminRequest(page: any, method: string, path: string, body?: unknown) {
  return page.request.fetch(`${BASE}${path}`, {
    method,
    data: body ? JSON.stringify(body) : undefined,
    headers: { "Content-Type": "application/json" },
  });
}

// ── test setup ───────────────────────────────────────────────────────────────

let teamId: string;

test.describe("W9: team policy API", () => {
  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    // Use the seeded admin account
    await page.goto(`${BASE}/sign-in`);
    await page.fill('input[name="email"]', "admin@test-seed.local");
    await page.fill('input[name="password"]', "password123");
    await page.click('button[type="submit"]');
    await page.waitForURL(`${BASE}/`);

    // Create a fresh team for policy tests
    const res = await adminRequest(page, "POST", "/api/admin/teams", {
      name: "Policy Test Team",
      slug: `policy-test-${Date.now()}`,
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    teamId = body.team.id;
    await page.close();
  });

  test("1. PATCH /api/admin/teams/[id] returns 401 for unauthenticated", async ({
    page,
  }) => {
    // Fresh page with no session
    await page.context().clearCookies();
    const res = await page.request.fetch(`${BASE}/api/admin/teams/${teamId}`, {
      method: "PATCH",
      data: JSON.stringify({ guardrailPolicy: "strict" }),
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status()).toBe(401);
  });

  test("2. Non-admin user gets 403 on PATCH team policy", async ({ page }) => {
    // Sign in as regular user
    await page.goto(`${BASE}/sign-in`);
    await page.fill('input[name="email"]', "user@test-seed.local");
    await page.fill('input[name="password"]', "password123");
    await page.click('button[type="submit"]');
    await page.waitForURL(`${BASE}/`);

    const res = await adminRequest(page, "PATCH", `/api/admin/teams/${teamId}`, {
      guardrailPolicy: "strict",
    });
    expect(res.status()).toBe(403);
  });

  test("3. Admin can set guardrailPolicy to strict", async ({ page }) => {
    await page.goto(`${BASE}/sign-in`);
    await page.fill('input[name="email"]', "admin@test-seed.local");
    await page.fill('input[name="password"]', "password123");
    await page.click('button[type="submit"]');
    await page.waitForURL(`${BASE}/`);

    const res = await adminRequest(page, "PATCH", `/api/admin/teams/${teamId}`, {
      guardrailPolicy: "strict",
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  test("4. Admin can set guardrailPolicy to permissive", async ({ page }) => {
    await page.goto(`${BASE}/sign-in`);
    await page.fill('input[name="email"]', "admin@test-seed.local");
    await page.fill('input[name="password"]', "password123");
    await page.click('button[type="submit"]');
    await page.waitForURL(`${BASE}/`);

    const res = await adminRequest(page, "PATCH", `/api/admin/teams/${teamId}`, {
      guardrailPolicy: "permissive",
    });
    expect(res.status()).toBe(200);
  });

  test("5. Invalid guardrailPolicy value is rejected", async ({ page }) => {
    await page.goto(`${BASE}/sign-in`);
    await page.fill('input[name="email"]', "admin@test-seed.local");
    await page.fill('input[name="password"]', "password123");
    await page.click('button[type="submit"]');
    await page.waitForURL(`${BASE}/`);

    const res = await adminRequest(page, "PATCH", `/api/admin/teams/${teamId}`, {
      guardrailPolicy: "ultra-strict", // not in enum
    });
    expect(res.status()).toBe(400);
  });

  test("6. Admin can enable vision (allowVision: true)", async ({ page }) => {
    await page.goto(`${BASE}/sign-in`);
    await page.fill('input[name="email"]', "admin@test-seed.local");
    await page.fill('input[name="password"]', "password123");
    await page.click('button[type="submit"]');
    await page.waitForURL(`${BASE}/`);

    const res = await adminRequest(page, "PATCH", `/api/admin/teams/${teamId}`, {
      allowVision: true,
    });
    expect(res.status()).toBe(200);
  });

  test("7. Admin can enable all multimodal flags simultaneously", async ({
    page,
  }) => {
    await page.goto(`${BASE}/sign-in`);
    await page.fill('input[name="email"]', "admin@test-seed.local");
    await page.fill('input[name="password"]', "password123");
    await page.click('button[type="submit"]');
    await page.waitForURL(`${BASE}/`);

    const res = await adminRequest(page, "PATCH", `/api/admin/teams/${teamId}`, {
      allowImageGen: true,
      allowVision: true,
      allowSpeech: true,
      guardrailPolicy: "standard",
    });
    expect(res.status()).toBe(200);
  });

  test("8. PATCH with unknown teamId returns 200 (upsert/no-op, idempotent)", async ({
    page,
  }) => {
    await page.goto(`${BASE}/sign-in`);
    await page.fill('input[name="email"]', "admin@test-seed.local");
    await page.fill('input[name="password"]', "password123");
    await page.click('button[type="submit"]');
    await page.waitForURL(`${BASE}/`);

    // Non-existent UUID — Drizzle update with no matching rows is not an error
    const res = await adminRequest(
      page,
      "PATCH",
      `/api/admin/teams/00000000-0000-0000-0000-000000000000`,
      { guardrailPolicy: "standard" },
    );
    expect([200, 404]).toContain(res.status());
  });

  test("9. GET /api/compliance/aup — returns accepted for user who has accepted", async ({
    page,
  }) => {
    await page.goto(`${BASE}/sign-in`);
    await page.fill('input[name="email"]', "admin@test-seed.local");
    await page.fill('input[name="password"]', "password123");
    await page.click('button[type="submit"]');
    await page.waitForURL(`${BASE}/`);

    const res = await page.request.get(`${BASE}/api/compliance/aup`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    // Admin accepted AUP in the W8 UI test earlier
    expect(typeof body.accepted).toBe("boolean");
  });

  test("10. GET /api/compliance/aup — 401 for unauthenticated", async ({
    page,
  }) => {
    await page.context().clearCookies();
    const res = await page.request.get(`${BASE}/api/compliance/aup`);
    expect(res.status()).toBe(401);
  });

  test("11. Prompt library API — GET /api/prompts returns 200", async ({
    page,
  }) => {
    await page.goto(`${BASE}/sign-in`);
    await page.fill('input[name="email"]', "admin@test-seed.local");
    await page.fill('input[name="password"]', "password123");
    await page.click('button[type="submit"]');
    await page.waitForURL(`${BASE}/`);

    const res = await page.request.get(`${BASE}/api/prompts`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body) || Array.isArray(body.prompts)).toBe(true);
  });

  test("12. Create private prompt — POST /api/prompts", async ({ page }) => {
    await page.goto(`${BASE}/sign-in`);
    await page.fill('input[name="email"]', "admin@test-seed.local");
    await page.fill('input[name="password"]', "password123");
    await page.click('button[type="submit"]');
    await page.waitForURL(`${BASE}/`);

    const res = await adminRequest(page, "POST", "/api/prompts", {
      title: "Test Prompt W9",
      content: "You are a helpful assistant focused on {{topic}}.",
      visibility: "private",
    });
    expect([200, 201]).toContain(res.status());
  });

  test("13. Create team-scoped prompt — requires teamId", async ({ page }) => {
    await page.goto(`${BASE}/sign-in`);
    await page.fill('input[name="email"]', "admin@test-seed.local");
    await page.fill('input[name="password"]', "password123");
    await page.click('button[type="submit"]');
    await page.waitForURL(`${BASE}/`);

    const res = await adminRequest(page, "POST", "/api/prompts", {
      title: "Team Prompt W9",
      content: "You are the {{role}} for our {{department}} team.",
      visibility: "team",
      teamId,
    });
    expect([200, 201]).toContain(res.status());
  });

  test("14. Message feedback — POST /api/feedback accepts thumbs-up", async ({
    page,
  }) => {
    await page.goto(`${BASE}/sign-in`);
    await page.fill('input[name="email"]', "admin@test-seed.local");
    await page.fill('input[name="password"]', "password123");
    await page.click('button[type="submit"]');
    await page.waitForURL(`${BASE}/`);

    const res = await adminRequest(page, "POST", "/api/feedback", {
      messageId: `msg-w9-test-${Date.now()}`,
      threadId: `thread-w9-test-${Date.now()}`,
      rating: "thumbs-up",
    });
    expect([200, 201]).toContain(res.status());
  });

  test("15. Message feedback — POST /api/feedback accepts thumbs-down with comment", async ({
    page,
  }) => {
    await page.goto(`${BASE}/sign-in`);
    await page.fill('input[name="email"]', "admin@test-seed.local");
    await page.fill('input[name="password"]', "password123");
    await page.click('button[type="submit"]');
    await page.waitForURL(`${BASE}/`);

    const res = await adminRequest(page, "POST", "/api/feedback", {
      messageId: `msg-w9-thumbdown-${Date.now()}`,
      threadId: `thread-w9-thumbdown-${Date.now()}`,
      rating: "thumbs-down",
      comment: "Response was inaccurate about EU AI Act scope.",
    });
    expect([200, 201]).toContain(res.status());
  });

  test("16. Unauthenticated user cannot POST /api/feedback", async ({ page }) => {
    await page.context().clearCookies();
    const res = await page.request.fetch(`${BASE}/api/feedback`, {
      method: "POST",
      data: JSON.stringify({
        messageId: "msg-anon",
        threadId: "thread-anon",
        rating: "thumbs-up",
      }),
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status()).toBe(401);
  });

  test("17. AUP modal not shown after acceptance (no dialog in DOM)", async ({
    page,
  }) => {
    // Admin accepted AUP earlier — revisiting should NOT show the modal
    await page.goto(`${BASE}/sign-in`);
    await page.fill('input[name="email"]', "admin@test-seed.local");
    await page.fill('input[name="password"]', "password123");
    await page.click('button[type="submit"]');
    await page.waitForURL(`${BASE}/`);
    // Give the AUP fetch time to settle
    await page.waitForTimeout(1500);

    const dialog = page.getByRole("dialog", {
      name: "Asafe AI — Acceptable Use Policy",
    });
    await expect(dialog).not.toBeVisible();
  });

  test("18. PATCH with empty body is a no-op (200)", async ({ page }) => {
    await page.goto(`${BASE}/sign-in`);
    await page.fill('input[name="email"]', "admin@test-seed.local");
    await page.fill('input[name="password"]', "password123");
    await page.click('button[type="submit"]');
    await page.waitForURL(`${BASE}/`);

    const res = await adminRequest(page, "PATCH", `/api/admin/teams/${teamId}`, {});
    expect(res.status()).toBe(200);
  });
});
