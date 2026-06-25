import { type BrowserContext, type Page, expect, test } from "@playwright/test";
import { eq } from "drizzle-orm";
import { pgDb } from "../../src/lib/db/pg/db.pg";
import {
  AgentSessionTable,
  ApprovalRequestTable,
  UserTable,
} from "../../src/lib/db/pg/schema.pg";
import { TEST_USERS } from "../constants/test-users";
import { suppressOnboardingOverlays } from "../helpers/session-prep";

// Inbox — Approvals tab (src/components/inbox/inbox-view.tsx)
//
// The approvals tab renders pending approval requests scoped to the signed-in
// user.  Fixtures are injected directly into the DB (same pattern as
// tests/helpers/seed-chat-message.ts) because:
//   1. Creating a real pending approval requires running a workflow executor
//      until it hits an approval node — far too heavyweight for UI tests.
//   2. The seed script cancels all pending approvals on every run, so any
//      fixture must be created inside the test itself.
//
// NOTE: agent_session rows in "awaiting_approval" status keep the Electric
// long-poll alive in the Runs sidebar, which prevents `networkidle`.  All
// navigations here use "domcontentloaded" to avoid hanging.

// ── DB fixture helpers ────────────────────────────────────────────────────────

type ApprovalFixture = {
  sessionId: string;
  requestId: string;
};

/**
 * Insert an agent_session (awaiting_approval) + approval_request (pending)
 * owned by the given user.  Returns both ids for cleanup.
 *
 * `definitionId` is intentionally FK-less in the schema (polymorphic), so we
 * can use a random UUID without referencing a real workflow or agent row.
 */
async function seedApproval(
  userEmail: string,
  opts: {
    requestedRole?: "owner" | "team-admin" | "admin";
    message?: string;
  } = {},
): Promise<ApprovalFixture> {
  const [user] = await pgDb
    .select({ id: UserTable.id })
    .from(UserTable)
    .where(eq(UserTable.email, userEmail));
  if (!user) throw new Error(`seedApproval: no user with email ${userEmail}`);

  const fakeDefinitionId = "00000000-0000-4000-a000-000000000001";

  const [session] = await pgDb
    .insert(AgentSessionTable)
    .values({
      kind: "workflow",
      definitionId: fakeDefinitionId,
      userId: user.id,
      originSurface: "api",
      status: "awaiting_approval",
      costSoFar: 0.0042,
    })
    .returning({ id: AgentSessionTable.id });

  const payload = {
    message:
      opts.message ??
      "Cost preview: this run will consume approximately $0.004. Approve to continue.",
  };

  const [request] = await pgDb
    .insert(ApprovalRequestTable)
    .values({
      sessionId: session.id,
      stepIndex: 1,
      payload,
      requestedRole: opts.requestedRole ?? "admin",
      status: "pending",
    })
    .returning({ id: ApprovalRequestTable.id });

  return { sessionId: session.id, requestId: request.id };
}

/** Hard-cancel all fixture rows created by the test (idempotent). */
async function cleanupApproval(fixture: ApprovalFixture): Promise<void> {
  // The cascade on approval_request(sessionId) handles the request row; cancel
  // the session first so the Electric live-query settles before page teardown.
  await pgDb
    .update(AgentSessionTable)
    .set({ status: "cancelled", endedAt: new Date() })
    .where(eq(AgentSessionTable.id, fixture.sessionId));
  await pgDb
    .update(ApprovalRequestTable)
    .set({ status: "rejected", reason: "e2e cleanup" })
    .where(eq(ApprovalRequestTable.id, fixture.requestId));
}

// ── Admin tests ───────────────────────────────────────────────────────────────

test.describe("Inbox — Approvals tab (admin)", () => {
  test.use({ storageState: TEST_USERS.admin.authFile });

  test.beforeEach(async ({ page }) => {
    await suppressOnboardingOverlays(page);
  });

  test("Approvals tab is the default active tab when a pending approval exists", async ({
    page,
  }) => {
    const fixture = await seedApproval(TEST_USERS.admin.email, {
      requestedRole: "admin",
    });

    try {
      await page.goto("/inbox", { waitUntil: "domcontentloaded" });

      // The first tab (Approvals) should be active — the InboxView component
      // defaults to "approvals" when approvals.length > 0.
      const approvalsTab = page.getByRole("tab").nth(0);
      await expect(approvalsTab).toHaveAttribute("data-state", "active");

      // The badge on the Approvals tab shows a count >= 1.
      const badge = approvalsTab.locator(".tabular-nums").first();
      await expect(badge).toBeVisible();
    } finally {
      await cleanupApproval(fixture);
    }
  });

  test("Approvals tab lists the pending approval item", async ({ page }) => {
    const fixture = await seedApproval(TEST_USERS.admin.email, {
      requestedRole: "admin",
      message: "Approve spend: $0.004",
    });

    try {
      await page.goto("/inbox", { waitUntil: "domcontentloaded" });

      // Make sure we are on the Approvals tab.
      await page.getByRole("tab").nth(0).click();

      const items = page.getByTestId("inbox-item");
      await expect(items.first()).toBeVisible({ timeout: 10000 });
    } finally {
      await cleanupApproval(fixture);
    }
  });

  test("selecting an approval shows the cost-preview detail pane", async ({
    page,
  }) => {
    const fixture = await seedApproval(TEST_USERS.admin.email, {
      requestedRole: "admin",
      message: "Cost preview: $0.004 — Approve to proceed.",
    });

    try {
      await page.goto("/inbox", { waitUntil: "domcontentloaded" });
      await page.getByRole("tab").nth(0).click();

      // Click the first approval item; the detail pane should open.
      const items = page.getByTestId("inbox-item");
      await items.first().click();

      const detail = page.getByTestId("inbox-detail");
      await expect(detail).toBeVisible({ timeout: 10000 });

      // The detail pane must show both action buttons.
      await expect(detail.getByTestId("approval-approve")).toBeVisible();
      await expect(detail.getByTestId("approval-reject")).toBeVisible();
    } finally {
      await cleanupApproval(fixture);
    }
  });

  test("admin can approve a pending approval — buttons disappear and run re-queues", async ({
    page,
  }) => {
    const fixture = await seedApproval(TEST_USERS.admin.email, {
      requestedRole: "admin",
      message: "Cost preview: approve this run.",
    });

    try {
      await page.goto("/inbox", { waitUntil: "domcontentloaded" });
      await page.getByRole("tab").nth(0).click();

      const items = page.getByTestId("inbox-item");
      await items.first().click();

      const detail = page.getByTestId("inbox-detail");
      await expect(detail.getByTestId("approval-approve")).toBeVisible({
        timeout: 10000,
      });

      // Approve: the Server Action fires and router.refresh() is called.
      // Intercept the Server Action POST so we know it completed.
      const [actionRes] = await Promise.all([
        page.waitForResponse(
          (res) =>
            res.request().method() === "POST" &&
            res.url().includes("/inbox"),
          { timeout: 15000 },
        ),
        detail.getByTestId("approval-approve").click(),
      ]);
      expect(
        actionRes.ok(),
        `approve action failed: ${actionRes.status()}`,
      ).toBeTruthy();

      // After the refresh the approved request no longer shows decision buttons.
      // The component sets decided=true → renders null (no buttons).
      await expect(
        detail.getByTestId("approval-approve"),
      ).not.toBeVisible({ timeout: 10000 });

      // Verify DB state: the approval_request is now "approved".
      const [updated] = await pgDb
        .select({ status: ApprovalRequestTable.status })
        .from(ApprovalRequestTable)
        .where(eq(ApprovalRequestTable.id, fixture.requestId));
      expect(updated?.status).toBe("approved");
    } finally {
      // Approval was already resolved — only cancel the session.
      await pgDb
        .update(AgentSessionTable)
        .set({ status: "cancelled", endedAt: new Date() })
        .where(eq(AgentSessionTable.id, fixture.sessionId));
    }
  });

  test("admin can reject a pending approval with a reason", async ({ page }) => {
    const fixture = await seedApproval(TEST_USERS.admin.email, {
      requestedRole: "admin",
      message: "Cost preview: reject this run.",
    });

    try {
      await page.goto("/inbox", { waitUntil: "domcontentloaded" });
      await page.getByRole("tab").nth(0).click();

      const items = page.getByTestId("inbox-item");
      await items.first().click();

      const detail = page.getByTestId("inbox-detail");
      await expect(detail.getByTestId("approval-reject")).toBeVisible({
        timeout: 10000,
      });

      // Click Reject to reveal the reason textarea.
      await detail.getByTestId("approval-reject").click();
      await expect(
        detail.getByTestId("approval-reject-reason"),
      ).toBeVisible();

      // Fill in a reason (required for confirm button to be enabled).
      await detail
        .getByTestId("approval-reject-reason")
        .fill("Cost exceeds budget allocation.");

      // Confirm the rejection.
      const [actionRes] = await Promise.all([
        page.waitForResponse(
          (res) =>
            res.request().method() === "POST" &&
            res.url().includes("/inbox"),
          { timeout: 15000 },
        ),
        detail.getByTestId("approval-confirm-reject").click(),
      ]);
      expect(
        actionRes.ok(),
        `reject action failed: ${actionRes.status()}`,
      ).toBeTruthy();

      // Decision buttons disappear after a decision.
      await expect(
        detail.getByTestId("approval-confirm-reject"),
      ).not.toBeVisible({ timeout: 10000 });

      // Verify DB state.
      const [updated] = await pgDb
        .select({
          status: ApprovalRequestTable.status,
          reason: ApprovalRequestTable.reason,
        })
        .from(ApprovalRequestTable)
        .where(eq(ApprovalRequestTable.id, fixture.requestId));
      expect(updated?.status).toBe("rejected");
      expect(updated?.reason).toBe("Cost exceeds budget allocation.");
    } finally {
      // Rejection already failed the session; just force-cancel to be safe.
      await pgDb
        .update(AgentSessionTable)
        .set({ status: "cancelled", endedAt: new Date() })
        .where(eq(AgentSessionTable.id, fixture.sessionId));
    }
  });

  test("approved and rejected approvals are no longer in the pending list after page refresh", async ({
    page,
  }) => {
    // Seed two approvals — we will approve one and reject the other.
    const fixture1 = await seedApproval(TEST_USERS.admin.email, {
      requestedRole: "admin",
      message: "To be approved.",
    });
    const fixture2 = await seedApproval(TEST_USERS.admin.email, {
      requestedRole: "admin",
      message: "To be rejected.",
    });

    try {
      await page.goto("/inbox", { waitUntil: "domcontentloaded" });
      await page.getByRole("tab").nth(0).click();

      const items = page.getByTestId("inbox-item");
      await expect(items.first()).toBeVisible({ timeout: 10000 });
      const initialCount = await items.count();
      expect(initialCount).toBeGreaterThanOrEqual(2);

      // Approve the first item.
      await items.first().click();
      const detail = page.getByTestId("inbox-detail");
      await expect(detail.getByTestId("approval-approve")).toBeVisible();
      await Promise.all([
        page.waitForResponse(
          (res) => res.request().method() === "POST" && res.url().includes("/inbox"),
          { timeout: 15000 },
        ),
        detail.getByTestId("approval-approve").click(),
      ]);

      // Reject the second item (reload first — detail locator re-evaluates lazily).
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.getByRole("tab").nth(0).click();
      const remainingItems = page.getByTestId("inbox-item");

      // After approving one, the count must have dropped by at least one.
      const afterApproveCount = await remainingItems.count();
      expect(afterApproveCount).toBeLessThan(initialCount);

      // Reject any remaining fixture item.
      if (afterApproveCount > 0) {
        await remainingItems.first().click();
        // Re-query the detail pane after reload so we get the live DOM reference.
        const detailAfterReload = page.getByTestId("inbox-detail");
        await expect(
          detailAfterReload.getByTestId("approval-reject"),
        ).toBeVisible({ timeout: 8000 });
        await detailAfterReload.getByTestId("approval-reject").click();
        await detailAfterReload
          .getByTestId("approval-reject-reason")
          .fill("e2e cleanup reject");
        await Promise.all([
          page.waitForResponse(
            (res) => res.request().method() === "POST" && res.url().includes("/inbox"),
            { timeout: 15000 },
          ),
          detailAfterReload.getByTestId("approval-confirm-reject").click(),
        ]);
      }

      // Final reload: both fixtures resolved → list should contain neither.
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.getByRole("tab").nth(0).click();
      const finalCount = await page.getByTestId("inbox-item").count();
      // Count must be lower than the initial seeded count.
      expect(finalCount).toBeLessThan(initialCount);
    } finally {
      // Cancel both fixture sessions individually (safest cleanup approach).
      for (const id of [fixture1.sessionId, fixture2.sessionId]) {
        await pgDb
          .update(AgentSessionTable)
          .set({ status: "cancelled", endedAt: new Date() })
          .where(eq(AgentSessionTable.id, id));
      }
    }
  });
});

// ── Isolation: regular user cannot see admin-owned approvals ─────────────────

test.describe("Inbox — Approvals tab (regular user isolation)", () => {
  let adminContext: BrowserContext;
  let adminPage: Page;
  let fixture: ApprovalFixture | null = null;

  test.beforeAll(async ({ browser }) => {
    adminContext = await browser.newContext({
      storageState: TEST_USERS.admin.authFile,
    });
    adminPage = await adminContext.newPage();
    await suppressOnboardingOverlays(adminPage);

    // Seed an approval that requires "admin" role — a regular user MUST NOT see
    // this in their own inbox (listPendingApprovalsForUser filters by role).
    fixture = await seedApproval(TEST_USERS.admin.email, {
      requestedRole: "admin",
      message: "Admin-only approval — regular user must not see this.",
    });
  });

  test.afterAll(async () => {
    if (fixture) {
      await cleanupApproval(fixture);
      fixture = null;
    }
    await adminContext.close();
  });

  test("regular user Approvals tab is empty when only admin-scoped approvals exist", async ({
    browser,
  }) => {
    const ctx = await browser.newContext({
      storageState: TEST_USERS.regular.authFile,
    });
    const regularPage = await ctx.newPage();
    await suppressOnboardingOverlays(regularPage);

    try {
      await regularPage.goto("/inbox", { waitUntil: "domcontentloaded" });

      // Switch to the Approvals tab explicitly.
      await regularPage.getByRole("tab").nth(0).click();

      // The admin-seeded approval must NOT appear in the regular user's list.
      // Either the list is empty (EmptyState rendered) or — if the user happens
      // to have their own approvals from unrelated activity — none of the items
      // should be the admin's fixture.
      const items = regularPage.getByTestId("inbox-item");
      const count = await items.count();
      if (count === 0) {
        // Happy-path: empty state is shown.
        await expect(
          regularPage.locator('[data-testid="inbox-list"]'),
        ).toBeVisible();
      } else {
        // The items belong to this user's own approvals — not the admin's.
        // We can't assert the exact IDs from the browser without exposing them,
        // but we can assert that the /api/agent-platform/approvals/count
        // endpoint (which the sidebar badge uses) does NOT inflate due to the
        // admin fixture.
        const countRes = await regularPage.request.get(
          "/api/agent-platform/approvals/count",
        );
        expect(countRes.ok()).toBeTruthy();
        const countBody = (await countRes.json()) as { pending: number };
        // The admin fixture is "admin"-scoped; a regular user's pending count
        // must not include it.
        expect(typeof countBody.pending).toBe("number");
        // The regular user has no own pending approvals (none seeded for them).
        expect(countBody.pending).toBe(0);
      }
    } finally {
      await ctx.close();
    }
  });

  test("/api/agent-platform/approvals/count returns 401 for unauthenticated requests", async ({
    browser,
  }) => {
    const anonCtx = await browser.newContext(); // no storageState
    const anonPage = await anonCtx.newPage();
    try {
      const res = await anonPage.request.get(
        "/api/agent-platform/approvals/count",
      );
      expect(res.status()).toBe(401);
    } finally {
      await anonCtx.close();
    }
  });
});
