/**
 * E2E tests for thread sharing (teamspaces read-only shared view).
 *
 * The sharing model works as follows:
 *   1. A thread owner moves a thread into a TEAM folder
 *      → thread visibility becomes "team" automatically.
 *   2. Any member of that team can visit /shared/[threadId] and see
 *      the messages read-only (no composer).
 *   3. A private thread (not in a team folder) is inaccessible to anyone
 *      other than the owner — /shared/[threadId] returns notFound().
 *
 * Setup hierarchy (all via REST, serial within each describe block):
 *   admin creates team
 *   admin adds editor2 as member
 *   admin creates a team folder via /api/teamspaces/folders (POST)
 *   admin seeds threads and messages directly via pgDb helpers
 *   admin moves thread into team folder via moveThreadToFolderAction (server action)
 *   → /shared/[threadId] is then accessible to editor2
 *
 * NOTE: The shared view page (/shared/[threadId]) requires the viewer to be
 * authenticated — it checks session AND team membership, then renders read-only.
 * Unauthenticated access → notFound() (Next.js serves 404). This is different
 * from a link-token model; there is no public share link with a token.
 *
 * Suite mapping:
 *   1  Shared thread is visible to a team member (authenticated viewer)
 *   2  Shared thread URL renders the thread title and messages
 *   3  Shared thread view has NO composer / send button (read-only)
 *   4  Private (unshared) thread returns 404 to another authenticated user
 *   5  Private thread URL redirects unauthenticated users (login gate)
 *   6  Shared thread with multiple messages shows all of them
 *   7  POST /api/chat for a shared thread is 403 for a non-owner
 *   8  Moving thread OUT of the team folder removes access for the other member
 */

import { Browser, BrowserContext, Page, expect, test } from "@playwright/test";
import { eq } from "drizzle-orm";
import { pgDb } from "../../src/lib/db/pg/db.pg";
import {
  ChatMessageTable,
  ChatThreadTable,
  FolderTable,
  UserTable,
} from "../../src/lib/db/pg/schema.pg";
import { TEST_USERS } from "../constants/test-users";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let _c = 0;
function uid(): string {
  _c++;
  return `ts-${_c}-${process.pid}`;
}

/** Look up a user's DB id by email. */
async function getUserId(email: string): Promise<string> {
  const [user] = await pgDb
    .select({ id: UserTable.id })
    .from(UserTable)
    .where(eq(UserTable.email, email));
  if (!user) throw new Error(`getUserId: no user with email ${email}`);
  return user.id;
}

/**
 * Seed a chat thread + any number of messages owned by a given user.
 * Returns { threadId }.
 */
async function seedThread(
  userEmail: string,
  messages: Array<{ role: "user" | "assistant"; text: string }>,
): Promise<{ threadId: string }> {
  const userId = await getUserId(userEmail);

  const [thread] = await pgDb
    .insert(ChatThreadTable)
    .values({ title: `e2e-sharing-${uid()}`, userId })
    .returning({ id: ChatThreadTable.id });

  for (const msg of messages) {
    await pgDb.insert(ChatMessageTable).values({
      id: `msg-${uid()}`,
      threadId: thread.id,
      role: msg.role,
      parts: [{ type: "text", text: msg.text }],
    });
  }

  return { threadId: thread.id };
}

/**
 * Create a team folder via the REST API (POST /api/teamspaces/folders).
 * The folder must be seeded with a teamId so that moving threads into it
 * sets their visibility to "team".
 *
 * NOTE: There is no public REST route for folder creation — folders are
 * managed via server actions. We insert directly via pgDb here.
 */
async function createTeamFolder(
  teamId: string,
  ownerEmail: string,
): Promise<{ folderId: string }> {
  const ownerId = await getUserId(ownerEmail);

  const [folder] = await pgDb
    .insert(FolderTable)
    .values({
      name: `e2e-folder-${uid()}`,
      ownerId,
      teamId,
      parentId: null,
    })
    .returning({ id: FolderTable.id });

  return { folderId: folder.id };
}

/**
 * Move a thread into a folder (or out of all folders with null) and update
 * visibility directly via pgDb, mirroring what moveThreadToFolder() does.
 * Using pgDb here avoids the Server Action boundary which cannot be called
 * from test code.
 */
async function moveThreadToFolder(
  threadId: string,
  folderId: string | null,
  teamId: string | null,
): Promise<void> {
  const visibility = teamId ? "team" : "private";
  await pgDb
    .update(ChatThreadTable)
    .set({ folderId, visibility })
    .where(eq(ChatThreadTable.id, threadId));
}

/** Create a team via the admin REST API. Returns teamId. */
async function createTeamViaApi(page: Page, name: string): Promise<string> {
  const res = await page.request.post("/api/admin/teams", {
    headers: { "Content-Type": "application/json" },
    data: { name },
    failOnStatusCode: false,
  });
  if (!res.ok()) {
    throw new Error(
      `createTeamViaApi: POST /api/admin/teams failed with ${res.status()}: ${await res.text()}`,
    );
  }
  const body = await res.json();
  // Shape: { team: { id } } or { id }
  const teamId: string = body?.team?.id ?? body?.id;
  if (!teamId) throw new Error("createTeamViaApi: no id in response");
  return teamId;
}

/** Add a member to a team by email via the admin REST API. */
async function addTeamMember(
  page: Page,
  teamId: string,
  email: string,
): Promise<void> {
  const res = await page.request.post(`/api/admin/teams/${teamId}/members`, {
    headers: { "Content-Type": "application/json" },
    data: { email, role: "member" },
    failOnStatusCode: false,
  });
  if (!res.ok()) {
    throw new Error(
      `addTeamMember: failed with ${res.status()}: ${await res.text()}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Suite 1: Shared thread is accessible to a team member
// ---------------------------------------------------------------------------

test.describe
  .serial("Suite 1 — Shared thread visible to team member", () => {
    let adminCtx: BrowserContext;
    let adminPage: Page;
    let memberCtx: BrowserContext;
    let memberPage: Page;
    let teamId: string;
    let folderId: string;
    let threadId: string;

    test.beforeAll(async ({ browser }: { browser: Browser }) => {
      adminCtx = await browser.newContext({
        storageState: TEST_USERS.admin.authFile,
      });
      adminPage = await adminCtx.newPage();

      memberCtx = await browser.newContext({
        storageState: TEST_USERS.editor2.authFile,
      });
      memberPage = await memberCtx.newPage();

      // Create team and add editor2 as member
      teamId = await createTeamViaApi(adminPage, `e2e-sharing-team-1-${uid()}`);
      await addTeamMember(adminPage, teamId, TEST_USERS.editor2.email);

      // Seed a thread owned by admin with one message
      ({ threadId } = await seedThread(TEST_USERS.admin.email, [
        { role: "user", text: "Hello from the shared thread" },
      ]));

      // Create a team folder and move the thread into it
      ({ folderId } = await createTeamFolder(teamId, TEST_USERS.admin.email));
      await moveThreadToFolder(threadId, folderId, teamId);
    });

    test.afterAll(async () => {
      // Reset visibility before tearing down
      await moveThreadToFolder(threadId, null, null);
      await adminCtx.close();
      await memberCtx.close();
    });

    test("team member can navigate to /shared/[threadId] without error", async () => {
      await memberPage.goto(`/shared/${threadId}`, {
        waitUntil: "domcontentloaded",
      });

      // The page should NOT redirect to /sign-in (already authenticated)
      expect(memberPage.url()).not.toContain("/sign-in");

      // The shared thread view container must render
      await expect(memberPage.getByTestId("shared-thread-view")).toBeVisible({
        timeout: 10_000,
      });
    });

    test("shared thread shows the thread title", async () => {
      await memberPage.goto(`/shared/${threadId}`, {
        waitUntil: "domcontentloaded",
      });

      await expect(memberPage.getByTestId("shared-thread-title")).toBeVisible({
        timeout: 10_000,
      });
    });
  });

// ---------------------------------------------------------------------------
// Suite 2: Shared thread URL shows the original messages
// ---------------------------------------------------------------------------

test.describe
  .serial("Suite 2 — Shared thread renders messages", () => {
    let adminCtx: BrowserContext;
    let adminPage: Page;
    let memberCtx: BrowserContext;
    let memberPage: Page;
    let teamId: string;
    let folderId: string;
    let threadId: string;

    test.beforeAll(async ({ browser }: { browser: Browser }) => {
      adminCtx = await browser.newContext({
        storageState: TEST_USERS.admin.authFile,
      });
      adminPage = await adminCtx.newPage();

      memberCtx = await browser.newContext({
        storageState: TEST_USERS.editor2.authFile,
      });
      memberPage = await memberCtx.newPage();

      teamId = await createTeamViaApi(adminPage, `e2e-sharing-team-2-${uid()}`);
      await addTeamMember(adminPage, teamId, TEST_USERS.editor2.email);

      ({ threadId } = await seedThread(TEST_USERS.admin.email, [
        { role: "user", text: "Suite2-msg-user" },
        { role: "assistant", text: "Suite2-msg-assistant" },
      ]));

      ({ folderId } = await createTeamFolder(teamId, TEST_USERS.admin.email));
      await moveThreadToFolder(threadId, folderId, teamId);
    });

    test.afterAll(async () => {
      await moveThreadToFolder(threadId, null, null);
      await adminCtx.close();
      await memberCtx.close();
    });

    test("shared thread shows all seeded messages", async () => {
      await memberPage.goto(`/shared/${threadId}`, {
        waitUntil: "domcontentloaded",
      });

      await expect(memberPage.getByTestId("shared-thread-view")).toBeVisible({
        timeout: 10_000,
      });

      // Both messages must appear in the read-only view
      await expect(
        memberPage.getByText("Suite2-msg-user", { exact: false }),
      ).toBeVisible({ timeout: 8_000 });

      await expect(
        memberPage.getByText("Suite2-msg-assistant", { exact: false }),
      ).toBeVisible({ timeout: 8_000 });
    });

    test("shared thread title is rendered in the page heading", async () => {
      // The thread title is seeded as `e2e-sharing-<uid>` — just check the
      // element exists and is non-empty.
      await memberPage.goto(`/shared/${threadId}`, {
        waitUntil: "domcontentloaded",
      });

      const titleEl = memberPage.getByTestId("shared-thread-title");
      await expect(titleEl).toBeVisible({ timeout: 10_000 });
      const titleText = await titleEl.textContent();
      expect((titleText ?? "").trim().length).toBeGreaterThan(0);
    });
  });

// ---------------------------------------------------------------------------
// Suite 3: Shared thread is read-only — no composer / send button
// ---------------------------------------------------------------------------

test.describe
  .serial("Suite 3 — Shared thread view is read-only", () => {
    let adminCtx: BrowserContext;
    let adminPage: Page;
    let memberCtx: BrowserContext;
    let memberPage: Page;
    let teamId: string;
    let folderId: string;
    let threadId: string;

    test.beforeAll(async ({ browser }: { browser: Browser }) => {
      adminCtx = await browser.newContext({
        storageState: TEST_USERS.admin.authFile,
      });
      adminPage = await adminCtx.newPage();

      memberCtx = await browser.newContext({
        storageState: TEST_USERS.editor2.authFile,
      });
      memberPage = await memberCtx.newPage();

      teamId = await createTeamViaApi(adminPage, `e2e-sharing-team-3-${uid()}`);
      await addTeamMember(adminPage, teamId, TEST_USERS.editor2.email);

      ({ threadId } = await seedThread(TEST_USERS.admin.email, [
        { role: "user", text: "Can you reply to this?" },
      ]));

      ({ folderId } = await createTeamFolder(teamId, TEST_USERS.admin.email));
      await moveThreadToFolder(threadId, folderId, teamId);
    });

    test.afterAll(async () => {
      await moveThreadToFolder(threadId, null, null);
      await adminCtx.close();
      await memberCtx.close();
    });

    test("shared thread view has no composer textbox", async () => {
      await memberPage.goto(`/shared/${threadId}`, {
        waitUntil: "domcontentloaded",
      });

      await expect(memberPage.getByTestId("shared-thread-view")).toBeVisible({
        timeout: 10_000,
      });

      // The composer textbox must NOT exist on the shared read-only view.
      await expect(
        memberPage.getByTestId("composer-textbox"),
      ).not.toBeVisible();
    });

    test("shared thread view has no Send button", async () => {
      await memberPage.goto(`/shared/${threadId}`, {
        waitUntil: "domcontentloaded",
      });

      await expect(memberPage.getByTestId("shared-thread-view")).toBeVisible({
        timeout: 10_000,
      });

      // The Send button aria-label is "Send" — must not appear in shared view.
      await expect(
        memberPage.getByRole("button", { name: /^send$/i }),
      ).not.toBeVisible();
    });

    test("shared thread view has no composer plus button", async () => {
      await memberPage.goto(`/shared/${threadId}`, {
        waitUntil: "domcontentloaded",
      });

      await expect(memberPage.getByTestId("shared-thread-view")).toBeVisible({
        timeout: 10_000,
      });

      // composer-plus-button is the attachment/tool launcher — must be absent.
      await expect(
        memberPage.getByTestId("composer-plus-button"),
      ).not.toBeVisible();
    });
  });

// ---------------------------------------------------------------------------
// Suite 4: Private thread returns 404 for another authenticated user
// ---------------------------------------------------------------------------

test.describe("Suite 4 — Private thread not accessible to other users", () => {
  test("authenticated user cannot access another user's private thread via /shared/", async ({
    browser,
  }) => {
    // Seed a private thread (NOT moved into any team folder)
    const { threadId } = await seedThread(TEST_USERS.admin.email, [
      { role: "user", text: "This is private" },
    ]);

    const ctx = await browser.newContext({
      storageState: TEST_USERS.editor2.authFile,
    });
    const page = await ctx.newPage();

    // Next.js notFound() renders the 404 page with HTTP 404.
    const response = await page.goto(`/shared/${threadId}`, {
      waitUntil: "domcontentloaded",
    });

    // The page must return a 404 (or redirect to 404-equivalent).
    // notFound() in Next.js App Router sends a 404 status.
    expect(response?.status()).toBe(404);

    // Clean up
    await pgDb.delete(ChatThreadTable).where(eq(ChatThreadTable.id, threadId));

    await ctx.close();
  });

  test("authenticated user cannot access a non-existent thread via /shared/", async ({
    browser,
  }) => {
    const ctx = await browser.newContext({
      storageState: TEST_USERS.regular.authFile,
    });
    const page = await ctx.newPage();

    const response = await page.goto(
      "/shared/00000000-0000-0000-0000-000000000000",
      { waitUntil: "domcontentloaded" },
    );

    expect(response?.status()).toBe(404);
    await ctx.close();
  });
});

// ---------------------------------------------------------------------------
// Suite 5: Unauthenticated access to any thread URL triggers auth redirect
// ---------------------------------------------------------------------------

test.describe("Suite 5 — Unauthenticated access redirects to sign-in", () => {
  test("unauthenticated user visiting /shared/[threadId] is redirected", async ({
    browser,
  }) => {
    // Seed a thread so the id is real (auth check happens before DB lookup)
    const { threadId } = await seedThread(TEST_USERS.admin.email, [
      { role: "user", text: "Auth gate test" },
    ]);

    // No storageState → unauthenticated browser context
    const ctx = await browser.newContext();
    const page = await ctx.newPage();

    await page.goto(`/shared/${threadId}`, { waitUntil: "domcontentloaded" });

    // The app must redirect to the sign-in page (auth middleware or
    // getSession() → notFound() which for unauthenticated users the middleware
    // intercepts first and sends to /sign-in).
    expect(page.url()).toContain("/sign-in");

    // Clean up
    await pgDb.delete(ChatThreadTable).where(eq(ChatThreadTable.id, threadId));

    await ctx.close();
  });

  test("unauthenticated user visiting a regular chat URL is redirected", async ({
    browser,
  }) => {
    const { threadId } = await seedThread(TEST_USERS.admin.email, [
      { role: "user", text: "Private chat auth gate" },
    ]);

    const ctx = await browser.newContext();
    const page = await ctx.newPage();

    await page.goto(`/chat/${threadId}`, { waitUntil: "domcontentloaded" });

    expect(page.url()).toContain("/sign-in");

    await pgDb.delete(ChatThreadTable).where(eq(ChatThreadTable.id, threadId));

    await ctx.close();
  });
});

// ---------------------------------------------------------------------------
// Suite 6: Shared thread with multiple messages shows all of them
// ---------------------------------------------------------------------------

test.describe
  .serial("Suite 6 — All messages visible in shared thread", () => {
    let adminCtx: BrowserContext;
    let adminPage: Page;
    let memberCtx: BrowserContext;
    let memberPage: Page;
    let teamId: string;
    let folderId: string;
    let threadId: string;

    const MESSAGES = [
      { role: "user" as const, text: "Suite6-first-message" },
      { role: "assistant" as const, text: "Suite6-second-message" },
      { role: "user" as const, text: "Suite6-third-message" },
    ];

    test.beforeAll(async ({ browser }: { browser: Browser }) => {
      adminCtx = await browser.newContext({
        storageState: TEST_USERS.admin.authFile,
      });
      adminPage = await adminCtx.newPage();

      memberCtx = await browser.newContext({
        storageState: TEST_USERS.editor2.authFile,
      });
      memberPage = await memberCtx.newPage();

      teamId = await createTeamViaApi(adminPage, `e2e-sharing-team-6-${uid()}`);
      await addTeamMember(adminPage, teamId, TEST_USERS.editor2.email);

      ({ threadId } = await seedThread(TEST_USERS.admin.email, MESSAGES));

      ({ folderId } = await createTeamFolder(teamId, TEST_USERS.admin.email));
      await moveThreadToFolder(threadId, folderId, teamId);
    });

    test.afterAll(async () => {
      await moveThreadToFolder(threadId, null, null);
      await adminCtx.close();
      await memberCtx.close();
    });

    test("shared thread displays all 3 seeded messages", async () => {
      await memberPage.goto(`/shared/${threadId}`, {
        waitUntil: "domcontentloaded",
      });

      await expect(memberPage.getByTestId("shared-thread-view")).toBeVisible({
        timeout: 10_000,
      });

      for (const msg of MESSAGES) {
        await expect(
          memberPage.getByText(msg.text, { exact: false }),
        ).toBeVisible({ timeout: 8_000 });
      }
    });
  });

// ---------------------------------------------------------------------------
// Suite 7: POST /api/chat is 403 for a non-owner on a shared thread
// ---------------------------------------------------------------------------

test.describe
  .serial("Suite 7 — Non-owner cannot POST to /api/chat for shared thread", () => {
    let adminCtx: BrowserContext;
    let adminPage: Page;
    let memberCtx: BrowserContext;
    let memberPage: Page;
    let teamId: string;
    let folderId: string;
    let threadId: string;

    test.beforeAll(async ({ browser }: { browser: Browser }) => {
      adminCtx = await browser.newContext({
        storageState: TEST_USERS.admin.authFile,
      });
      adminPage = await adminCtx.newPage();

      memberCtx = await browser.newContext({
        storageState: TEST_USERS.editor2.authFile,
      });
      memberPage = await memberCtx.newPage();

      teamId = await createTeamViaApi(adminPage, `e2e-sharing-team-7-${uid()}`);
      await addTeamMember(adminPage, teamId, TEST_USERS.editor2.email);

      ({ threadId } = await seedThread(TEST_USERS.admin.email, [
        { role: "user", text: "Owner's message" },
      ]));

      ({ folderId } = await createTeamFolder(teamId, TEST_USERS.admin.email));
      await moveThreadToFolder(threadId, folderId, teamId);
    });

    test.afterAll(async () => {
      await moveThreadToFolder(threadId, null, null);
      await adminCtx.close();
      await memberCtx.close();
    });

    test("non-owner POST /api/chat for shared thread returns 403", async () => {
      // Navigate first so cookies are set on the domain
      await memberPage.goto("/", { waitUntil: "domcontentloaded" });

      const msgId = uid();
      const response = await memberPage.request.post("/api/chat", {
        headers: { "Content-Type": "application/json" },
        data: {
          id: threadId, // existing thread owned by admin
          message: {
            id: msgId,
            role: "user",
            parts: [{ type: "text", text: "Trying to inject a message" }],
          },
          toolChoice: "none",
        },
        failOnStatusCode: false,
      });

      // The route checks session.user.id against thread.userId and returns 403
      // when they do not match.
      expect(response.status(), `expected 403, got ${response.status()}`).toBe(
        403,
      );
    });

    test("thread owner CAN POST /api/chat for their own thread (not 401/403)", async () => {
      await adminPage.goto("/", { waitUntil: "domcontentloaded" });

      const msgId = uid();
      const response = await adminPage.request.post("/api/chat", {
        headers: { "Content-Type": "application/json" },
        data: {
          id: threadId,
          message: {
            id: msgId,
            role: "user",
            parts: [{ type: "text", text: "Owner sending a message" }],
          },
          toolChoice: "none",
        },
        failOnStatusCode: false,
      });

      const status = response.status();
      // Auth must pass; downstream may fail (402/422/500) if AI not configured.
      expect(status, `owner must not be blocked; got ${status}`).not.toBe(401);
      expect(status, `owner must not be blocked; got ${status}`).not.toBe(403);
    });
  });

// ---------------------------------------------------------------------------
// Suite 8: Moving thread out of team folder removes access
// ---------------------------------------------------------------------------

test.describe
  .serial("Suite 8 — Revoking share removes access for team member", () => {
    let adminCtx: BrowserContext;
    let adminPage: Page;
    let memberCtx: BrowserContext;
    let memberPage: Page;
    let teamId: string;
    let folderId: string;
    let threadId: string;

    test.beforeAll(async ({ browser }: { browser: Browser }) => {
      adminCtx = await browser.newContext({
        storageState: TEST_USERS.admin.authFile,
      });
      adminPage = await adminCtx.newPage();

      memberCtx = await browser.newContext({
        storageState: TEST_USERS.editor2.authFile,
      });
      memberPage = await memberCtx.newPage();

      teamId = await createTeamViaApi(adminPage, `e2e-sharing-team-8-${uid()}`);
      await addTeamMember(adminPage, teamId, TEST_USERS.editor2.email);

      ({ threadId } = await seedThread(TEST_USERS.admin.email, [
        { role: "user", text: "Will be revoked" },
      ]));

      ({ folderId } = await createTeamFolder(teamId, TEST_USERS.admin.email));
      await moveThreadToFolder(threadId, folderId, teamId);
    });

    test.afterAll(async () => {
      // Ensure thread is private regardless of test outcome
      await moveThreadToFolder(threadId, null, null).catch(() => {});
      await adminCtx.close();
      await memberCtx.close();
    });

    test("member can access thread before revocation", async () => {
      await memberPage.goto(`/shared/${threadId}`, {
        waitUntil: "domcontentloaded",
      });

      await expect(memberPage.getByTestId("shared-thread-view")).toBeVisible({
        timeout: 10_000,
      });
    });

    test("after moving thread out of team folder, member gets 404", async () => {
      // Revoke: move thread back to no-folder (private)
      await moveThreadToFolder(threadId, null, null);

      const response = await memberPage.goto(`/shared/${threadId}`, {
        waitUntil: "domcontentloaded",
      });

      // notFound() → 404; the shared-thread-view must not render.
      expect(response?.status()).toBe(404);
      await expect(
        memberPage.getByTestId("shared-thread-view"),
      ).not.toBeVisible();
    });

    test("after revocation, owner can still view their own thread normally", async () => {
      // Thread is now private — owner accesses it via /chat/[id], not /shared/.
      await adminPage.goto(`/chat/${threadId}`, {
        waitUntil: "domcontentloaded",
      });

      // The chat page should load without redirecting away.
      expect(adminPage.url()).toContain(`/chat/${threadId}`);
    });
  });
