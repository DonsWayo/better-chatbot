import { expect, test } from "@playwright/test";
import { TEST_USERS } from "../constants/test-users";
import { seedChatMessage } from "../helpers/seed-chat-message";

const FEEDBACK_URL = "/api/feedback";

test.describe("Feedback API", () => {
  test.describe("Authenticated user — happy path", () => {
    test.use({ storageState: TEST_USERS.regular.authFile });

    test("POST with 'up' rating returns 200 { ok: true }", async ({ page }) => {
      // The route resolves messageId against a real, caller-owned message
      // (synthetic ids 404 since the deep-audit hardening), so seed one first.
      const { messageId, threadId } = await seedChatMessage(
        TEST_USERS.regular.email,
      );

      const response = await page.request.post(FEEDBACK_URL, {
        data: {
          messageId,
          threadId,
          rating: "up",
        },
      });

      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body).toMatchObject({ ok: true });
    });

    test("POSTing again with 'down' rating updates the existing record (upsert)", async ({
      page,
    }) => {
      const { messageId, threadId } = await seedChatMessage(
        TEST_USERS.regular.email,
      );

      // First POST: thumbs up
      const first = await page.request.post(FEEDBACK_URL, {
        data: { messageId, threadId, rating: "up" },
      });
      expect(first.status()).toBe(200);

      // Second POST: thumbs down — should upsert, not error
      const second = await page.request.post(FEEDBACK_URL, {
        data: {
          messageId,
          threadId,
          rating: "down",
          comment: "Changed my mind",
        },
      });
      expect(second.status()).toBe(200);
      const body = await second.json();
      expect(body).toMatchObject({ ok: true });
    });

    test("DELETE with messageId removes the feedback and returns 200", async ({
      page,
    }) => {
      const { messageId, threadId } = await seedChatMessage(
        TEST_USERS.regular.email,
      );

      // Create feedback first
      const created = await page.request.post(FEEDBACK_URL, {
        data: { messageId, threadId, rating: "up" },
      });
      expect(created.status()).toBe(200);

      // Delete it
      const deleted = await page.request.delete(
        `${FEEDBACK_URL}?messageId=${encodeURIComponent(messageId)}`,
      );
      expect(deleted.status()).toBe(200);
      const body = await deleted.json();
      expect(body).toMatchObject({ ok: true });
    });
  });

  test.describe("Authenticated user — validation errors", () => {
    test.use({ storageState: TEST_USERS.editor.authFile });

    test("POST without messageId returns 400", async ({ page }) => {
      const response = await page.request.post(FEEDBACK_URL, {
        data: {
          threadId: `thread-${Date.now()}`,
          rating: "up",
        },
      });

      expect(response.status()).toBe(400);
    });

    test("POST with missing rating returns 400", async ({ page }) => {
      const messageId = `msg-no-rating-${Date.now()}-${Math.random().toString(36).slice(2)}`;

      const response = await page.request.post(FEEDBACK_URL, {
        data: {
          messageId,
          threadId: `thread-${Date.now()}`,
          // rating intentionally omitted
        },
      });

      expect(response.status()).toBe(400);
    });
  });

  test.describe("Unauthenticated — 401", () => {
    // No storageState → unauthenticated browser context
    test("POST without a session returns 401", async ({ browser }) => {
      const context = await browser.newContext(); // no storageState
      const page = await context.newPage();

      const response = await page.request.post(FEEDBACK_URL, {
        data: {
          messageId: `msg-unauth-${Date.now()}`,
          threadId: `thread-unauth-${Date.now()}`,
          rating: "up",
        },
      });

      expect(response.status()).toBe(401);
      await context.close();
    });
  });
});
