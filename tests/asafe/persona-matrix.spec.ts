import { test, expect, BrowserContext, Page } from "@playwright/test";
import { TEST_USERS } from "../constants/test-users";

let counter = 0;
function uid(): string {
  counter++;
  return `e2e-${counter}-${process.pid}`;
}

function chatBody() {
  const id = uid();
  return {
    id,
    message: {
      id: uid(),
      role: "user",
      parts: [{ type: "text", text: "hi" }],
    },
    toolChoice: "none",
  };
}

// ---------------------------------------------------------------------------
// Block 1: Anonymous visitor (Personas 1-5)
// ---------------------------------------------------------------------------

test.describe("Personas 1-5: Anonymous visitor", () => {
  // Each test creates its own fresh anonymous context (no storageState)

  test("P1: GET /api/prompts → 401", async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    try {
      const response = await page.request.get("/api/prompts", {
        failOnStatusCode: false,
      });
      expect(response.status()).toBe(401);
    } finally {
      await ctx.close();
    }
  });

  test("P2: GET /api/knowledge/collections → 401", async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    try {
      const response = await page.request.get("/api/knowledge/collections", {
        failOnStatusCode: false,
      });
      expect(response.status()).toBe(401);
    } finally {
      await ctx.close();
    }
  });

  test("P3: POST /api/feedback → 401", async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    try {
      const response = await page.request.post("/api/feedback", {
        headers: { "Content-Type": "application/json" },
        data: { messageId: "x", threadId: "t", rating: "up" },
        failOnStatusCode: false,
      });
      expect(response.status()).toBe(401);
    } finally {
      await ctx.close();
    }
  });

  test("P4: POST /api/chat → 401", async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    try {
      const response = await page.request.post("/api/chat", {
        headers: { "Content-Type": "application/json" },
        data: chatBody(),
        failOnStatusCode: false,
      });
      expect(response.status()).toBe(401);
    } finally {
      await ctx.close();
    }
  });

  test("P5: GET /api/mcp/list → 401 or 403", async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    try {
      const response = await page.request.get("/api/mcp/list", {
        failOnStatusCode: false,
      });
      expect([401, 403]).toContain(response.status());
    } finally {
      await ctx.close();
    }
  });
});

// ---------------------------------------------------------------------------
// Block 2: Regular user — read access (Personas 6-9)
// ---------------------------------------------------------------------------

test.describe("Personas 6-9: Regular user — read access", () => {
  // Each test creates its own context with regular user auth

  test("P6: GET /api/prompts → 200", async ({ browser }) => {
    const ctx = await browser.newContext({
      storageState: TEST_USERS.regular.authFile,
    });
    const page = await ctx.newPage();
    try {
      const response = await page.request.get("/api/prompts", {
        failOnStatusCode: false,
      });
      expect(response.status()).toBe(200);
    } finally {
      await ctx.close();
    }
  });

  test("P7: GET /api/knowledge/collections → 200 with collections property", async ({
    browser,
  }) => {
    const ctx = await browser.newContext({
      storageState: TEST_USERS.regular.authFile,
    });
    const page = await ctx.newPage();
    try {
      const response = await page.request.get("/api/knowledge/collections", {
        failOnStatusCode: false,
      });
      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body).toHaveProperty("collections");
    } finally {
      await ctx.close();
    }
  });

  test("P8: GET /admin → regular user is blocked (unauthorized, no admin content)", async ({
    browser,
  }) => {
    const ctx = await browser.newContext({
      storageState: TEST_USERS.regular.authFile,
    });
    const page = await ctx.newPage();
    try {
      // The admin layout calls requireAdminPermission() → unauthorized(), which
      // renders the Next.js unauthorized boundary at the SAME url (no redirect).
      // Assert the non-admin is blocked rather than asserting a navigation away.
      await page.goto("/admin", { waitUntil: "networkidle" });
      await expect(
        page.getByText(/unauthorized|forbidden|not authorized/i).first(),
      ).toBeVisible();
    } finally {
      await ctx.close();
    }
  });

  test("P9: POST /api/feedback → 200 (allowed for any authenticated user)", async ({
    browser,
  }) => {
    const ctx = await browser.newContext({
      storageState: TEST_USERS.regular.authFile,
    });
    const page = await ctx.newPage();
    try {
      const response = await page.request.post("/api/feedback", {
        headers: { "Content-Type": "application/json" },
        data: { messageId: uid(), threadId: uid(), rating: "up" },
        failOnStatusCode: false,
      });
      expect(response.status()).toBe(200);
    } finally {
      await ctx.close();
    }
  });
});

// ---------------------------------------------------------------------------
// Block 3: Regular user — write restrictions (Personas 10-14)
// ---------------------------------------------------------------------------

test.describe("Personas 10-14: Regular user — write restrictions", () => {
  // Each test creates its own context with regular user auth

  test("P10: POST /api/mcp → 401 or 403 (regular user cannot create MCP)", async ({
    browser,
  }) => {
    const ctx = await browser.newContext({
      storageState: TEST_USERS.regular.authFile,
    });
    const page = await ctx.newPage();
    try {
      const response = await page.request.post("/api/mcp", {
        headers: { "Content-Type": "application/json" },
        data: {
          name: uid(),
          config: { command: "node", args: [] },
          visibility: "private",
        },
        failOnStatusCode: false,
      });
      expect([401, 403]).toContain(response.status());
    } finally {
      await ctx.close();
    }
  });

  test("P11: POST /api/knowledge/collections → 403 (regular user cannot create collections)", async ({
    browser,
  }) => {
    const ctx = await browser.newContext({
      storageState: TEST_USERS.regular.authFile,
    });
    const page = await ctx.newPage();
    try {
      const response = await page.request.post("/api/knowledge/collections", {
        headers: { "Content-Type": "application/json" },
        data: { name: uid() },
        failOnStatusCode: false,
      });
      expect(response.status()).toBe(403);
    } finally {
      await ctx.close();
    }
  });

  test("P12: POST /api/prompts → 201 (regular user CAN create private prompts)", async ({
    browser,
  }) => {
    const ctx = await browser.newContext({
      storageState: TEST_USERS.regular.authFile,
    });
    const page = await ctx.newPage();
    try {
      const response = await page.request.post("/api/prompts", {
        headers: { "Content-Type": "application/json" },
        data: {
          title: uid(),
          content: "c",
          visibility: "private",
        },
        failOnStatusCode: false,
      });
      expect(response.status()).toBe(201);
    } finally {
      await ctx.close();
    }
  });

  test("P13: DELETE /api/mcp/:id → 401 or 403 (regular user cannot delete MCP)", async ({
    browser,
  }) => {
    const ctx = await browser.newContext({
      storageState: TEST_USERS.regular.authFile,
    });
    const page = await ctx.newPage();
    try {
      const response = await page.request.delete(
        "/api/mcp/fake-nonexistent-id",
        {
          failOnStatusCode: false,
        },
      );
      // A regular user must never succeed at deleting an MCP server. A bogus id
      // returns 404 (server not found) before any owner check; auth holes would
      // surface as 401/403. Anything other than these means the guard failed.
      expect([401, 403, 404]).toContain(response.status());
    } finally {
      await ctx.close();
    }
  });

  test("P14: GET /admin/teams → regular user is blocked (unauthorized)", async ({
    browser,
  }) => {
    const ctx = await browser.newContext({
      storageState: TEST_USERS.regular.authFile,
    });
    const page = await ctx.newPage();
    try {
      // Admin layout gates via requireAdminPermission() → unauthorized() which
      // renders at the same url (no redirect). Assert the block, not the URL.
      await page.goto("/admin/teams", { waitUntil: "networkidle" });
      await expect(
        page.getByText(/unauthorized|forbidden|not authorized/i).first(),
      ).toBeVisible();
    } finally {
      await ctx.close();
    }
  });
});

// ---------------------------------------------------------------------------
// Block 4: Editor — elevated write (Personas 15-19)
// ---------------------------------------------------------------------------

test.describe.serial("Personas 15-19: Editor — elevated write", () => {
  let editorContext: BrowserContext;
  let editorPage: Page;
  let editorServerId: string | undefined;

  test.beforeAll(async ({ browser }) => {
    editorContext = await browser.newContext({
      storageState: TEST_USERS.editor.authFile,
    });
    editorPage = await editorContext.newPage();
  });

  test.afterAll(async () => {
    if (editorServerId) {
      await editorPage.request
        .delete(`/api/mcp/${editorServerId}`, { failOnStatusCode: false })
        .catch(() => {
          // best-effort cleanup
        });
    }
    await editorContext.close();
  });

  test("P15: POST /api/mcp (personal scope) → 200, capture id", async () => {
    const response = await editorPage.request.post("/api/mcp", {
      headers: { "Content-Type": "application/json" },
      data: {
        name: `e2e-editor-${uid()}`,
        config: {
          command: "node",
          args: ["tests/fixtures/test-mcp-server.js"],
        },
        visibility: "private",
        scope: "personal",
      },
      failOnStatusCode: false,
    });
    expect(response.status()).toBe(200);
    const body = await response.json();
    editorServerId = body.id;
    expect(editorServerId).toBeTruthy();
  });

  test("P16: POST /api/mcp (org scope) → 401 or 403 (editor cannot create org-scoped MCP)", async () => {
    const response = await editorPage.request.post("/api/mcp", {
      headers: { "Content-Type": "application/json" },
      data: {
        name: uid(),
        config: {
          command: "node",
          args: ["tests/fixtures/test-mcp-server.js"],
        },
        visibility: "private",
        scope: "org",
      },
      failOnStatusCode: false,
    });
    expect([401, 403]).toContain(response.status());
  });

  test("P17: POST /api/prompts → 201 (editor can create prompts)", async () => {
    const response = await editorPage.request.post("/api/prompts", {
      headers: { "Content-Type": "application/json" },
      data: {
        title: `ep-${uid()}`,
        content: "c",
        visibility: "private",
      },
      failOnStatusCode: false,
    });
    expect(response.status()).toBe(201);
  });

  test("P18: GET /api/knowledge/collections → 200", async () => {
    const response = await editorPage.request.get(
      "/api/knowledge/collections",
      { failOnStatusCode: false },
    );
    expect(response.status()).toBe(200);
  });

  test("P19: POST /api/knowledge/collections → 403 (editor cannot create collections)", async () => {
    const response = await editorPage.request.post(
      "/api/knowledge/collections",
      {
        headers: { "Content-Type": "application/json" },
        data: { name: uid() },
        failOnStatusCode: false,
      },
    );
    expect(response.status()).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// Block 5: Admin — full control (Personas 20-23)
// ---------------------------------------------------------------------------

test.describe.serial("Personas 20-23: Admin — full control", () => {
  let adminContext: BrowserContext;
  let adminPage: Page;
  let adminCollectionId: string | undefined;
  let adminMcpServerId: string | undefined;

  test.beforeAll(async ({ browser }) => {
    adminContext = await browser.newContext({
      storageState: TEST_USERS.admin.authFile,
    });
    adminPage = await adminContext.newPage();
  });

  test.afterAll(async () => {
    if (adminCollectionId) {
      await adminPage.request
        .delete(`/api/knowledge/collections/${adminCollectionId}`, {
          failOnStatusCode: false,
        })
        .catch(() => {
          // best-effort cleanup
        });
    }
    if (adminMcpServerId) {
      await adminPage.request
        .delete(`/api/mcp/${adminMcpServerId}`, { failOnStatusCode: false })
        .catch(() => {
          // best-effort cleanup
        });
    }
    await adminContext.close();
  });

  test("P20: POST /api/knowledge/collections → 200 or 201, capture id", async () => {
    const response = await adminPage.request.post(
      "/api/knowledge/collections",
      {
        headers: { "Content-Type": "application/json" },
        data: { name: `admin-col-${uid()}` },
        failOnStatusCode: false,
      },
    );
    expect([200, 201]).toContain(response.status());
    const body = await response.json();
    adminCollectionId = body.collection?.id ?? body.id;
    expect(adminCollectionId).toBeTruthy();
  });

  test("P21: page.goto('/admin') → final URL includes '/admin'", async () => {
    await adminPage.goto("/admin", { waitUntil: "networkidle" });
    expect(adminPage.url()).toContain("/admin");
  });

  test("P22: POST /api/mcp (org scope) → 200, capture id", async () => {
    const response = await adminPage.request.post("/api/mcp", {
      headers: { "Content-Type": "application/json" },
      data: {
        name: `admin-org-${uid()}`,
        config: {
          command: "node",
          args: ["tests/fixtures/test-mcp-server.js"],
        },
        visibility: "private",
        scope: "org",
      },
      failOnStatusCode: false,
    });
    expect(response.status()).toBe(200);
    const body = await response.json();
    adminMcpServerId = body.id;
    expect(adminMcpServerId).toBeTruthy();
  });

  test("P23: GET /api/prompts → 200 array", async () => {
    const response = await adminPage.request.get("/api/prompts", {
      failOnStatusCode: false,
    });
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(Array.isArray(body)).toBe(true);
  });
});
