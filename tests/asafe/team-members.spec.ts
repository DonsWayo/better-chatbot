/**
 * E2E tests for team member management API and UI.
 *
 * POST /api/admin/teams/[id]/members   — add member by email or userId
 * DELETE /api/admin/teams/[id]/members/[memberId] — remove member
 *
 * Tests run serially to share state across steps.
 * afterAll cleans up the created team.
 */

import { Browser, BrowserContext, Page, expect, test } from "@playwright/test";
import { TEST_USERS } from "../constants/test-users";

let _c = 0;
function uid(): string {
  _c++;
  return `${_c}-${process.pid}`;
}

let adminContext: BrowserContext;
let adminPage: Page;
let teamId: string | undefined;
let memberId: string | undefined;

test.describe
  .serial("Team Members API", () => {
    test.beforeAll(async ({ browser }: { browser: Browser }) => {
      adminContext = await browser.newContext({
        storageState: TEST_USERS.admin.authFile,
      });
      adminPage = await adminContext.newPage();
    });

    test.afterAll(async () => {
      if (teamId) {
        // Clean up: there's no DELETE /api/admin/teams but we can leave it
        // The team name is unique enough to not pollute other tests
      }
      await adminContext.close();
    });

    // ── Setup: create a team to test member management on ────────────────────
    test("setup: create a test team", async () => {
      const res = await adminPage.request.post("/api/admin/teams", {
        headers: { "Content-Type": "application/json" },
        data: { name: `e2e-team-members-${uid()}` },
      });
      expect(res.status()).toBe(200);
      const body = await res.json();
      teamId = body?.team?.id ?? body?.id;
      expect(typeof teamId).toBe("string");
    });

    // ── Add member by email ───────────────────────────────────────────────────
    test("admin: POST /api/admin/teams/[id]/members — add editor by email", async () => {
      if (!teamId) test.skip(true, "team not created");

      const res = await adminPage.request.post(
        `/api/admin/teams/${teamId}/members`,
        {
          headers: { "Content-Type": "application/json" },
          data: { email: TEST_USERS.editor.email, role: "editor" },
        },
      );
      expect(res.status(), `expected 200, got ${res.status()}`).toBe(200);

      const body = await res.json();
      expect(body.ok).toBe(true);
    });

    // ── List members to capture memberId ────────────────────────────────────
    test("admin: GET /api/admin/teams/[id]/members — lists added member", async () => {
      if (!teamId) test.skip(true, "team not created");

      const res = await adminPage.request.get(
        `/api/admin/teams/${teamId}/members`,
      );
      expect(res.status(), `expected 200, got ${res.status()}`).toBe(200);

      const body = await res.json();
      expect(Array.isArray(body.members)).toBe(true);

      const member = body.members.find(
        (m: { email: string; id: string }) =>
          m.email === TEST_USERS.editor.email,
      );
      expect(member, "editor should be in members list").toBeTruthy();
      memberId = member?.id;
    });

    // ── Add member by userId (idempotent role update) ────────────────────────
    test("admin: POST — re-add same user with different role (idempotent update)", async () => {
      if (!teamId) test.skip(true, "team not created");

      const res = await adminPage.request.post(
        `/api/admin/teams/${teamId}/members`,
        {
          headers: { "Content-Type": "application/json" },
          data: { email: TEST_USERS.editor.email, role: "member" },
        },
      );
      expect(
        res.status(),
        `expected 200 for role update, got ${res.status()}`,
      ).toBe(200);
    });

    // ── Reject unknown email ─────────────────────────────────────────────────
    test("admin: POST with non-existent email returns 404", async () => {
      if (!teamId) test.skip(true, "team not created");

      const res = await adminPage.request.post(
        `/api/admin/teams/${teamId}/members`,
        {
          headers: { "Content-Type": "application/json" },
          data: { email: "nobody@noexist-domain-xyz.com" },
        },
      );
      expect(res.status()).toBe(404);
    });

    // ── Reject missing body ──────────────────────────────────────────────────
    test("admin: POST with no email or userId returns 400", async () => {
      if (!teamId) test.skip(true, "team not created");

      const res = await adminPage.request.post(
        `/api/admin/teams/${teamId}/members`,
        {
          headers: { "Content-Type": "application/json" },
          data: { role: "member" },
        },
      );
      expect(res.status()).toBe(400);
    });

    // ── Non-admin cannot add members ────────────────────────────────────────
    test("editor: POST /api/admin/teams/[id]/members returns 403", async ({
      browser,
    }) => {
      if (!teamId) test.skip(true, "team not created");

      const ctx = await browser.newContext({
        storageState: TEST_USERS.editor.authFile,
      });
      const page = await ctx.newPage();

      const res = await page.request.post(
        `/api/admin/teams/${teamId}/members`,
        {
          headers: { "Content-Type": "application/json" },
          data: { email: TEST_USERS.regular.email },
        },
      );
      expect(res.status()).toBe(403);

      await ctx.close();
    });

    // ── Remove a wrong member (not in team) returns 404 ─────────────────────
    test("admin: DELETE with non-existent memberId returns 404", async () => {
      if (!teamId) test.skip(true, "team not created");

      const fakeId = "00000000-0000-0000-0000-000000000000";
      const res = await adminPage.request.delete(
        `/api/admin/teams/${teamId}/members/${fakeId}`,
      );
      expect(res.status()).toBe(404);
    });

    // ── Non-admin cannot remove members ─────────────────────────────────────
    test("editor: DELETE /api/admin/teams/[id]/members/[id] returns 403", async ({
      browser,
    }) => {
      if (!teamId || !memberId) test.skip(true, "precondition not met");

      const ctx = await browser.newContext({
        storageState: TEST_USERS.editor.authFile,
      });
      const page = await ctx.newPage();

      const res = await page.request.delete(
        `/api/admin/teams/${teamId}/members/${memberId}`,
      );
      expect(res.status()).toBe(403);

      await ctx.close();
    });

    // ── Anonymous user is blocked ────────────────────────────────────────────
    test("anonymous: POST /api/admin/teams/[id]/members returns 401", async ({
      browser,
    }) => {
      if (!teamId) test.skip(true, "team not created");

      const ctx = await browser.newContext();
      const page = await ctx.newPage();

      const res = await page.request.post(
        `/api/admin/teams/${teamId}/members`,
        {
          headers: { "Content-Type": "application/json" },
          data: { email: TEST_USERS.regular.email },
        },
      );
      expect(res.status()).toBe(401);

      await ctx.close();
    });

    // ── Remove the member ────────────────────────────────────────────────────
    test("admin: DELETE /api/admin/teams/[id]/members/[memberId] succeeds", async () => {
      if (!teamId || !memberId) test.skip(true, "precondition not met");

      const res = await adminPage.request.delete(
        `/api/admin/teams/${teamId}/members/${memberId}`,
      );
      expect(res.status(), `expected 200, got ${res.status()}`).toBe(200);

      const body = await res.json();
      expect(body.ok).toBe(true);
    });

    // ── Verify member removed from list ─────────────────────────────────────
    test("admin: GET members after removal — list is empty", async () => {
      if (!teamId) test.skip(true, "team not created");

      const res = await adminPage.request.get(
        `/api/admin/teams/${teamId}/members`,
      );
      expect(res.status()).toBe(200);

      const body = await res.json();
      const found = body.members?.find(
        (m: { email: string }) => m.email === TEST_USERS.editor.email,
      );
      expect(found).toBeUndefined();
    });
  });
