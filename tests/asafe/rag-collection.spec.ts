import { test, expect, BrowserContext, Page } from "@playwright/test";
import { TEST_USERS } from "../constants/test-users";
import {
  createKnowledgeCollection,
  deleteKnowledgeCollection,
} from "../helpers/create-knowledge";

let _c = 0;
function uid(): string {
  _c++;
  return `${_c}-${process.pid}`;
}

test.describe.serial("RAG collection integration", () => {
  let adminContext: BrowserContext;
  let adminPage: Page;
  let collectionId: string;

  test.beforeAll(async ({ browser }) => {
    adminContext = await browser.newContext({
      storageState: TEST_USERS.admin.authFile,
    });
    adminPage = await adminContext.newPage();

    const collection = await createKnowledgeCollection(adminPage, {
      name: `rag-e2e-${uid()}`,
    });
    if (!collection) {
      throw new Error("beforeAll: failed to create knowledge collection");
    }
    collectionId = collection.id;
  });

  test("GET /api/knowledge/collections as regular user returns 200 with collections array", async ({
    browser,
  }) => {
    const ctx = await browser.newContext({
      storageState: TEST_USERS.regular.authFile,
    });
    const page = await ctx.newPage();

    const response = await page.request.get("/api/knowledge/collections", {
      failOnStatusCode: false,
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toHaveProperty("collections");
    expect(Array.isArray(body.collections)).toBe(true);

    await ctx.close();
  });

  test("GET /api/knowledge/collections as editor returns 200", async ({
    browser,
  }) => {
    const ctx = await browser.newContext({
      storageState: TEST_USERS.editor.authFile,
    });
    const page = await ctx.newPage();

    const response = await page.request.get("/api/knowledge/collections", {
      failOnStatusCode: false,
    });

    expect(response.status()).toBe(200);

    await ctx.close();
  });

  test("POST /api/chat with ragCollectionId as regular user does not return 500 or 403", async ({
    browser,
  }) => {
    const ctx = await browser.newContext({
      storageState: TEST_USERS.regular.authFile,
    });
    const page = await ctx.newPage();

    const chatId = uid();
    const msgId = uid();

    const response = await page.request.post("/api/chat", {
      headers: { "Content-Type": "application/json" },
      data: {
        id: chatId,
        message: {
          id: msgId,
          role: "user",
          parts: [{ type: "text", text: "hello" }],
        },
        toolChoice: "none",
        ragCollectionId: collectionId,
      },
      failOnStatusCode: false,
    });

    expect(response.status()).not.toBe(500);
    expect(response.status()).not.toBe(403);

    await ctx.close();
  });

  test("POST /api/chat with non-existent ragCollectionId does not return 500 (graceful handling)", async ({
    browser,
  }) => {
    const ctx = await browser.newContext({
      storageState: TEST_USERS.regular.authFile,
    });
    const page = await ctx.newPage();

    const chatId = uid();
    const msgId = uid();

    const response = await page.request.post("/api/chat", {
      headers: { "Content-Type": "application/json" },
      data: {
        id: chatId,
        message: {
          id: msgId,
          role: "user",
          parts: [{ type: "text", text: "hello" }],
        },
        toolChoice: "none",
        ragCollectionId: "00000000-0000-0000-0000-000000000000",
      },
      failOnStatusCode: false,
    });

    expect(response.status()).not.toBe(500);

    await ctx.close();
  });

  test("POST /api/chat without ragCollectionId does not return 500 (control case)", async ({
    browser,
  }) => {
    const ctx = await browser.newContext({
      storageState: TEST_USERS.regular.authFile,
    });
    const page = await ctx.newPage();

    const chatId = uid();
    const msgId = uid();

    const response = await page.request.post("/api/chat", {
      headers: { "Content-Type": "application/json" },
      data: {
        id: chatId,
        message: {
          id: msgId,
          role: "user",
          parts: [{ type: "text", text: "hello" }],
        },
        toolChoice: "none",
      },
      failOnStatusCode: false,
    });

    expect(response.status()).not.toBe(500);

    await ctx.close();
  });

  test.afterAll(async () => {
    if (collectionId) {
      await deleteKnowledgeCollection(adminPage, collectionId);
    }
    await adminContext.close();
  });
});
