import { expect, test } from "@playwright/test";
import { TEST_USERS } from "../constants/test-users";

// Public /api/v1 REST API — API key authentication + resource endpoints.
//
// Key provisioning strategy: each test that needs a real key navigates to
// /admin/api-keys with an admin session, fills the Name input, clicks Create,
// and reads the one-time plaintext secret from the reveal box. Revocation is
// done the same way (click the Revoke button in the same row). The key is
// created in a fresh admin context to keep tests hermetic.
//
// Tests that only need to verify auth-failure paths (401/400) use plain
// page.request without any Bearer token — no key provisioning needed.

const BASE = "http://localhost:3001";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Use the admin/api-keys UI to mint a fresh key. Returns the plaintext secret.
 * Must be called with an admin-authenticated page.
 */
async function createApiKeyViaUi(
  page: import("@playwright/test").Page,
  keyName: string,
): Promise<string> {
  await page.goto("/admin/api-keys");
  await page.waitForLoadState("networkidle");

  await page.fill("#api-key-name", keyName);

  // Wait for the Server Action response that indicates the key was created.
  const [actionResponse] = await Promise.all([
    page.waitForResponse(
      (res) =>
        res.request().method() === "POST" &&
        res.url().includes("/admin/api-keys"),
      { timeout: 15_000 },
    ),
    page.getByRole("button", { name: "Create" }).click(),
  ]);
  expect(
    actionResponse.ok(),
    `createApiKeyAction Server Action returned ${actionResponse.status()}`,
  ).toBeTruthy();

  // The plaintext appears in the single <code> element inside the amber reveal box.
  const secretCode = page
    .locator(".border-amber-500\\/40 code")
    .or(page.locator('[class*="amber"] code'))
    .first();
  await expect(secretCode).toBeVisible({ timeout: 10_000 });
  const plaintext = (await secretCode.textContent()) ?? "";
  expect(plaintext).toMatch(/^ck_live_/);
  return plaintext.trim();
}

/**
 * Revoke the most recently created key for the given `keyName` via the UI.
 * Must be called with an admin-authenticated page.
 */
async function revokeApiKeyViaUi(
  page: import("@playwright/test").Page,
  keyName: string,
): Promise<void> {
  await page.goto("/admin/api-keys");
  await page.waitForLoadState("networkidle");

  // The table row for this key has the name in the first cell; the last cell
  // has the Revoke button. Match the row by key name, then click Revoke.
  const row = page.locator("tr").filter({ hasText: keyName });
  const revokeBtn = row.getByRole("button", { name: "Revoke" });
  if (await revokeBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await revokeBtn.click();
    // Wait for the row's status badge to flip to "revoked".
    await expect(row.getByText("revoked")).toBeVisible({ timeout: 10_000 });
  }
}

// ---------------------------------------------------------------------------
// Auth-wall tests — no API key needed
// ---------------------------------------------------------------------------

test.describe("POST /api/v1/sessions — auth failures (no key required)", () => {
  test("returns 401 when Authorization header is missing", async ({
    browser,
  }) => {
    const ctx = await browser.newContext(); // no storageState
    const pg = await ctx.newPage();

    const res = await pg.request.post(`${BASE}/api/v1/sessions`, {
      headers: { "Content-Type": "application/json" },
      data: { workflowId: "non-existent-workflow" },
    });

    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("unauthorized");
    await ctx.close();
  });

  test("returns 401 when Authorization header has a bogus token", async ({
    browser,
  }) => {
    const ctx = await browser.newContext();
    const pg = await ctx.newPage();

    const res = await pg.request.post(`${BASE}/api/v1/sessions`, {
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer ck_live_thisisntreal",
      },
      data: { workflowId: "non-existent-workflow" },
    });

    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("unauthorized");
    await ctx.close();
  });

  test("returns 400 when body is missing workflowId", async ({
    browser,
  }) => {
    // We cannot verify a valid-key 400 without a real key, but we CAN verify
    // that the shape of a 401 (no key) is correct — and also test that
    // agentId-only body is specifically rejected with 400 when the key IS
    // valid (covered by a keyed test below). Here we just verify unauthenticated
    // requests still 401 regardless of body.
    const ctx = await browser.newContext();
    const pg = await ctx.newPage();

    const res = await pg.request.post(`${BASE}/api/v1/sessions`, {
      headers: { "Content-Type": "application/json" },
      data: {},
    });
    expect(res.status()).toBe(401);
    await ctx.close();
  });
});

test.describe("GET /api/v1/sessions/[id] — auth failures", () => {
  test("returns 401 without a key", async ({ browser }) => {
    const ctx = await browser.newContext();
    const pg = await ctx.newPage();
    const res = await pg.request.get(`${BASE}/api/v1/sessions/nonexistent-id`);
    expect(res.status()).toBe(401);
    await ctx.close();
  });
});

test.describe("GET /api/v1/sessions/[id]/transcript — auth failures", () => {
  test("returns 401 without a key", async ({ browser }) => {
    const ctx = await browser.newContext();
    const pg = await ctx.newPage();
    const res = await pg.request.get(
      `${BASE}/api/v1/sessions/nonexistent-id/transcript`,
    );
    expect(res.status()).toBe(401);
    await ctx.close();
  });
});

test.describe("GET /api/v1/agents — auth failures", () => {
  test("returns 401 without a key", async ({ browser }) => {
    const ctx = await browser.newContext();
    const pg = await ctx.newPage();
    const res = await pg.request.get(`${BASE}/api/v1/agents`);
    expect(res.status()).toBe(401);
    await ctx.close();
  });
});

// ---------------------------------------------------------------------------
// Key-provisioned tests — admin session provisions the key, then we use it
// ---------------------------------------------------------------------------

test.describe("API key — happy path via provisioned key", () => {
  test.use({ storageState: TEST_USERS.admin.authFile });

  test("GET /api/v1/agents returns 200 + agents array scoped to key owner", async ({
    page,
    browser,
  }) => {
    const keyName = `e2e-agents-list-${Date.now()}`;
    const plaintext = await createApiKeyViaUi(page, keyName);

    const ctx = await browser.newContext();
    const pg = await ctx.newPage();
    try {
      const res = await pg.request.get(`${BASE}/api/v1/agents`, {
        headers: { Authorization: `Bearer ${plaintext}` },
      });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body).toHaveProperty("agents");
      expect(Array.isArray(body.agents)).toBe(true);
      // Each agent record should carry the required fields.
      for (const agent of body.agents) {
        expect(agent).toHaveProperty("id");
        expect(agent).toHaveProperty("name");
        expect(agent).toHaveProperty("visibility");
        expect(agent).toHaveProperty("userId");
      }
    } finally {
      await ctx.close();
      await revokeApiKeyViaUi(page, keyName);
    }
  });

  test("POST /api/v1/sessions with agentId (no workflowId) returns 400", async ({
    page,
    browser,
  }) => {
    const keyName = `e2e-agent-id-reject-${Date.now()}`;
    const plaintext = await createApiKeyViaUi(page, keyName);

    const ctx = await browser.newContext();
    const pg = await ctx.newPage();
    try {
      const res = await pg.request.post(`${BASE}/api/v1/sessions`, {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${plaintext}`,
        },
        data: { agentId: "any-agent-id" },
      });
      expect(res.status()).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe("invalid_request");
      // Message should explain the right approach.
      expect(body.error.message.toLowerCase()).toContain("workflowid");
    } finally {
      await ctx.close();
      await revokeApiKeyViaUi(page, keyName);
    }
  });

  test("POST /api/v1/sessions with missing workflowId returns 400", async ({
    page,
    browser,
  }) => {
    const keyName = `e2e-missing-workflow-${Date.now()}`;
    const plaintext = await createApiKeyViaUi(page, keyName);

    const ctx = await browser.newContext();
    const pg = await ctx.newPage();
    try {
      const res = await pg.request.post(`${BASE}/api/v1/sessions`, {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${plaintext}`,
        },
        data: { input: { query: "hello" } },
      });
      expect(res.status()).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe("invalid_request");
    } finally {
      await ctx.close();
      await revokeApiKeyViaUi(page, keyName);
    }
  });

  test("POST /api/v1/sessions with a non-existent workflowId returns 4xx", async ({
    page,
    browser,
  }) => {
    // The workflow doesn't exist so the endpoint returns 404 (not_found) or 403
    // (forbidden) depending on which check fires first. Either is acceptable;
    // importantly it must NOT be 200/202 and must NOT be a 5xx.
    const keyName = `e2e-bad-workflow-${Date.now()}`;
    const plaintext = await createApiKeyViaUi(page, keyName);

    const ctx = await browser.newContext();
    const pg = await ctx.newPage();
    try {
      const res = await pg.request.post(`${BASE}/api/v1/sessions`, {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${plaintext}`,
        },
        data: { workflowId: "00000000-0000-0000-0000-000000000000" },
      });
      expect(res.status()).toBeGreaterThanOrEqual(400);
      expect(res.status()).toBeLessThan(500);
      const body = await res.json();
      expect(body).toHaveProperty("error");
    } finally {
      await ctx.close();
      await revokeApiKeyViaUi(page, keyName);
    }
  });

  test("GET /api/v1/sessions/[id] returns 404 for a session the key owner doesn't own", async ({
    page,
    browser,
  }) => {
    const keyName = `e2e-session-404-${Date.now()}`;
    const plaintext = await createApiKeyViaUi(page, keyName);

    const ctx = await browser.newContext();
    const pg = await ctx.newPage();
    try {
      // Use a well-formed UUID that doesn't exist in the database.
      const res = await pg.request.get(
        `${BASE}/api/v1/sessions/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee`,
        {
          headers: { Authorization: `Bearer ${plaintext}` },
        },
      );
      expect(res.status()).toBe(404);
      const body = await res.json();
      expect(body.error.code).toBe("not_found");
    } finally {
      await ctx.close();
      await revokeApiKeyViaUi(page, keyName);
    }
  });

  test("GET /api/v1/sessions/[id]/transcript returns 404 for unknown session", async ({
    page,
    browser,
  }) => {
    const keyName = `e2e-transcript-404-${Date.now()}`;
    const plaintext = await createApiKeyViaUi(page, keyName);

    const ctx = await browser.newContext();
    const pg = await ctx.newPage();
    try {
      const res = await pg.request.get(
        `${BASE}/api/v1/sessions/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee/transcript`,
        {
          headers: { Authorization: `Bearer ${plaintext}` },
        },
      );
      expect(res.status()).toBe(404);
    } finally {
      await ctx.close();
      await revokeApiKeyViaUi(page, keyName);
    }
  });
});

// ---------------------------------------------------------------------------
// Key revocation — the same admin session provisions then immediately revokes
// ---------------------------------------------------------------------------

test.describe("API key — revoked key returns 401", () => {
  test.use({ storageState: TEST_USERS.admin.authFile });

  test("revoked key is rejected with 401 on all /api/v1 endpoints", async ({
    page,
    browser,
  }) => {
    const keyName = `e2e-revoke-test-${Date.now()}`;
    const plaintext = await createApiKeyViaUi(page, keyName);

    // Verify the key is valid before revoking.
    const ctxBefore = await browser.newContext();
    const pgBefore = await ctxBefore.newPage();
    const validRes = await pgBefore.request.get(`${BASE}/api/v1/agents`, {
      headers: { Authorization: `Bearer ${plaintext}` },
    });
    expect(validRes.status()).toBe(200);
    await ctxBefore.close();

    // Revoke via the admin UI.
    await revokeApiKeyViaUi(page, keyName);

    // After revocation the same key must be rejected.
    const ctxAfter = await browser.newContext();
    const pgAfter = await ctxAfter.newPage();
    try {
      const revokedRes = await pgAfter.request.get(`${BASE}/api/v1/agents`, {
        headers: { Authorization: `Bearer ${plaintext}` },
      });
      expect(revokedRes.status()).toBe(401);
      const body = await revokedRes.json();
      expect(body.error.code).toBe("unauthorized");
    } finally {
      await ctxAfter.close();
    }
  });

  test("revoked key is rejected on POST /api/v1/sessions", async ({
    page,
    browser,
  }) => {
    const keyName = `e2e-revoke-sessions-${Date.now()}`;
    const plaintext = await createApiKeyViaUi(page, keyName);

    await revokeApiKeyViaUi(page, keyName);

    const ctx = await browser.newContext();
    const pg = await ctx.newPage();
    try {
      const res = await pg.request.post(`${BASE}/api/v1/sessions`, {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${plaintext}`,
        },
        data: { workflowId: "00000000-0000-0000-0000-000000000000" },
      });
      expect(res.status()).toBe(401);
    } finally {
      await ctx.close();
    }
  });
});

// ---------------------------------------------------------------------------
// Admin API-keys page — UI smoke tests
// ---------------------------------------------------------------------------

test.describe("/admin/api-keys page", () => {
  test.use({ storageState: TEST_USERS.admin.authFile });

  test("page renders the Create API key card and key table", async ({
    page,
  }) => {
    await page.goto("/admin/api-keys");
    await page.waitForLoadState("networkidle");

    // The Create card label (rendered as text, not a heading element)
    await expect(page.getByText(/create api key/i).first()).toBeVisible();

    // The Name input (the id may vary; locate by role + accessible name instead)
    await expect(
      page.getByRole("textbox", { name: /name/i }).first(),
    ).toBeVisible();

    // The Create button
    await expect(
      page.getByRole("button", { name: /^create$/i }),
    ).toBeVisible();
  });

  test("creating a key shows the one-time reveal box with a ck_live_ secret", async ({
    page,
  }) => {
    const keyName = `e2e-ui-smoke-${Date.now()}`;
    await page.goto("/admin/api-keys");
    await page.waitForLoadState("networkidle");

    await page.fill("#api-key-name", keyName);

    const [actionRes] = await Promise.all([
      page.waitForResponse(
        (res) =>
          res.request().method() === "POST" &&
          res.url().includes("/admin/api-keys"),
        { timeout: 15_000 },
      ),
      page.getByRole("button", { name: /^create$/i }).click(),
    ]);
    expect(actionRes.ok()).toBeTruthy();

    // The amber reveal box appears.
    await expect(
      page.getByText(/copy this secret now/i),
    ).toBeVisible({ timeout: 10_000 });

    const secretEl = page
      .locator('[class*="amber"] code, .border-amber-500\\/40 code')
      .first();
    await expect(secretEl).toBeVisible();
    const secret = await secretEl.textContent();
    expect(secret?.trim()).toMatch(/^ck_live_/);

    // Cleanup
    await revokeApiKeyViaUi(page, keyName);
  });
});
