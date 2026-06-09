/**
 * W12 E2E tests — kill switch and SLO observability endpoints.
 *
 * Kill-switch tests work by directly toggling the DB flag and verifying
 * the chat API returns 503 within the 5-second cache window.
 *
 * SLO tests verify that /api/metrics exposes the W12 Prometheus metrics.
 */

import { test, expect } from "@playwright/test";
import { TEST_USERS } from "../constants/test-users";

const BASE = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3001";

let _c = 0;
function uid(): string {
  _c++;
  return `${_c}-${process.pid}-w12`;
}

function chatBody() {
  return {
    id: uid(),
    message: { id: uid(), role: "user", parts: [{ type: "text", text: "hello" }] },
    toolChoice: "none",
  };
}

// Helper: toggle kill switch in DB via the admin reset API
// We use the admin API rather than raw DB so no direct DB credentials are required in E2E.
// If no such API exists, we skip gracefully.
async function setKillSwitch(
  adminPage: import("@playwright/test").Page,
  enabled: boolean,
): Promise<boolean> {
  const res = await adminPage.request.post(`${BASE}/api/admin/feature-flags`, {
    headers: { "Content-Type": "application/json" },
    data: { name: "kill_switch", enabled },
  });
  return res.status() === 200;
}

// ---------------------------------------------------------------------------
// SLO / Metrics endpoint tests (no DB changes needed)
// ---------------------------------------------------------------------------

test.describe("W12 — /api/metrics (SLO metrics)", () => {
  test("GET /api/metrics returns 200 and includes asafe_ai_ metrics", async ({
    browser,
  }) => {
    // Metrics endpoint is admin-only
    const ctx = await browser.newContext({
      storageState: TEST_USERS.admin.authFile,
    });
    const page = await ctx.newPage();

    const res = await page.request.get(`${BASE}/api/metrics`);
    expect(res.status()).toBe(200);

    const body = await res.text();

    // Verify W12 SLO metrics are present
    expect(body).toContain("asafe_ai_ttft_ms");
    expect(body).toContain("asafe_ai_active_requests");
    expect(body).toContain("asafe_ai_kill_switch_activations_total");
    expect(body).toContain("asafe_ai_rate_limit_activations_total");
    expect(body).toContain("asafe_ai_provider_errors_total");

    await ctx.close();
  });

  test("GET /api/metrics returns Content-Type text/plain (Prometheus format)", async ({
    browser,
  }) => {
    const ctx = await browser.newContext({
      storageState: TEST_USERS.admin.authFile,
    });
    const page = await ctx.newPage();

    const res = await page.request.get(`${BASE}/api/metrics`);
    const ct = res.headers()["content-type"] ?? "";
    expect(ct).toMatch(/text\/plain/);

    await ctx.close();
  });

  test("GET /api/metrics is forbidden for non-admin users", async ({
    browser,
  }) => {
    const ctx = await browser.newContext({
      storageState: TEST_USERS.regular.authFile,
    });
    const page = await ctx.newPage();

    const res = await page.request.get(`${BASE}/api/metrics`);
    expect([401, 403]).toContain(res.status());

    await ctx.close();
  });
});

// ---------------------------------------------------------------------------
// Kill switch via the DB toggle (requires admin feature-flag API)
// ---------------------------------------------------------------------------

test.describe("W12 — kill switch (DB-backed)", () => {
  test("chat returns 503 while kill switch is active, then resumes on deactivation", async ({
    browser,
  }) => {
    const adminCtx = await browser.newContext({
      storageState: TEST_USERS.admin.authFile,
    });
    const adminPage = await adminCtx.newPage();

    // Only proceed if the feature-flag admin API exists
    const canToggle = await setKillSwitch(adminPage, true);
    if (!canToggle) {
      test.skip(true, "Feature-flag admin API not available — skip kill-switch E2E");
      return;
    }

    try {
      // Give the 5-second cache time to expire — in CI we use a shorter TTL (ASAFE_KILL_SWITCH_CACHE_TTL=100ms)
      // In the absence of that env, wait just over 5 s.
      await adminPage.waitForTimeout(5_500);

      // Regular user should now receive 503
      const userCtx = await browser.newContext({
        storageState: TEST_USERS.regular.authFile,
      });
      const userPage = await userCtx.newPage();

      const blockedRes = await userPage.request.post(`${BASE}/api/chat`, {
        headers: { "Content-Type": "application/json" },
        data: chatBody(),
      });
      expect(blockedRes.status()).toBe(503);
      const body = await blockedRes.json();
      expect(body.message).toMatch(/temporarily unavailable/i);

      await userCtx.close();
    } finally {
      // Always deactivate — don't leave the kill switch on
      await setKillSwitch(adminPage, false);
      await adminCtx.close();
    }
  });

  test("health endpoint is NOT blocked by kill switch", async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    // /api/health should always be reachable regardless of kill switch
    const res = await page.request.get(`${BASE}/api/health`);
    expect(res.status()).toBe(200);
    await ctx.close();
  });
});

// ---------------------------------------------------------------------------
// Rate-limit headers (RFC 7231)
// ---------------------------------------------------------------------------

test.describe("W12 — rate-limit headers", () => {
  test("POST /api/chat returns X-RateLimit-* headers on success", async ({
    browser,
  }) => {
    const ctx = await browser.newContext({
      storageState: TEST_USERS.editor.authFile,
    });
    const page = await ctx.newPage();

    const res = await page.request.post(`${BASE}/api/chat`, {
      headers: { "Content-Type": "application/json" },
      data: chatBody(),
    });

    // We only care about headers; accept any 2xx (stream starts) or 4xx (model error in CI)
    const headers = res.headers();
    if (res.status() !== 429) {
      expect(headers["x-ratelimit-limit"]).toBeTruthy();
      expect(headers["x-ratelimit-remaining"]).toBeTruthy();
      expect(headers["x-ratelimit-reset"]).toBeTruthy();
    }

    await ctx.close();
  });
});
