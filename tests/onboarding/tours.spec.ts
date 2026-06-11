import { expect, test } from "@playwright/test";
import { TEST_USERS } from "../constants/test-users";
import {
  BASE,
  acceptAupViaApi,
  getPreferences,
  putPreferences,
  signInViaApi,
} from "../helpers/session-prep";

// Onboarding tours (NextStep v2) — src/components/tour/*:
// - app-tours.tsx: auto-start controller. Gated on preferences being loaded
//   AND the AUP being accepted (it polls GET /api/compliance/aup); fires
//   ~800ms after landing on the right pathname. Completion/skip is persisted
//   to UserPreferences.completedTours through PUT /api/user/preferences.
// - tour-logic.ts: "welcome" auto-starts on "/" for everyone; "admin" on
//   /admin for admins only.
// - asafe-tour-card.tsx: the card is role="dialog" with aria-label = step
//   title; step dots live in a container labelled "Step {n} of {total}"
//   (messages/en.json Tours.stepOf); primary button is "Next"/"Done", and
//   Esc skips (built into NextStep — it calls onSkip, which persists).
//
// A dedicated seeded user (testuser12, role "user", unused by other specs)
// gets its completedTours reset so the welcome tour is "fresh"; the admin
// tour runs as a brand-new admin created through the better-auth admin
// endpoints so the shared admin's tour state is never touched.

// testUsers[8] => testuser12@test-seed.local, role "user" (i+4 = 12 > 9).
const FRESH_TOUR_USER = TEST_USERS.testUsers[8];

// Welcome tour has 6 steps, admin tour has 5 (use-tour-steps.tsx).
const WELCOME_TITLE = "Welcome to Conek AI";

test.describe.configure({ mode: "serial" });

test.describe("Onboarding tours", () => {
  test("fresh user sees the welcome tour and the primary button advances the steps", async ({
    page,
  }) => {
    await signInViaApi(page, FRESH_TOUR_USER);
    // Fresh = no completed tours; keep the rest of the preferences intact.
    const prefs = await getPreferences(page);
    await putPreferences(page, { ...prefs, completedTours: [] });
    // The compliance seed promises AUP acceptance; the tour controller is
    // gated on it, so verify and (idempotently) ensure it through the API.
    await acceptAupViaApi(page);
    const aupRes = await page.request.get("/api/compliance/aup");
    expect(((await aupRes.json()) as { accepted: boolean }).accepted).toBe(
      true,
    );

    await page.goto("/");

    // Step 1 — centered intro card (no anchor selector).
    const intro = page.getByRole("dialog", { name: WELCOME_TITLE });
    await expect(intro).toBeVisible({ timeout: 20000 });
    await expect(page.getByLabel("Step 1 of 6")).toBeVisible();

    // The one filled primary action advances the tour.
    await intro.getByRole("button", { name: "Next", exact: true }).click();
    await expect(
      page.getByRole("dialog", { name: "Start a new chat" }),
    ).toBeVisible({ timeout: 10000 });
    await expect(page.getByLabel("Step 2 of 6")).toBeVisible();

    // And once more, to prove the dots track the current step.
    await page
      .getByRole("dialog", { name: "Start a new chat" })
      .getByRole("button", { name: "Next", exact: true })
      .click();
    await expect(
      page.getByRole("dialog", { name: "Find anything" }),
    ).toBeVisible({ timeout: 10000 });
    await expect(page.getByLabel("Step 3 of 6")).toBeVisible();
  });

  test("Esc dismisses the welcome tour, persists the skip, and it stays gone after reload", async ({
    page,
  }) => {
    await signInViaApi(page, FRESH_TOUR_USER);
    const prefs = await getPreferences(page);
    await putPreferences(page, { ...prefs, completedTours: [] });
    await acceptAupViaApi(page);

    await page.goto("/");
    const intro = page.getByRole("dialog", { name: WELCOME_TITLE });
    await expect(intro).toBeVisible({ timeout: 20000 });

    // Esc is NextStep's built-in skip — it must call onSkip and persist.
    await page.keyboard.press("Escape");
    await expect(intro).not.toBeVisible();

    // The skip lands in UserPreferences.completedTours via the API.
    await expect
      .poll(
        async () => {
          const res = await page.request.get("/api/user/preferences");
          const current = (await res.json()) as { completedTours?: string[] };
          return current.completedTours ?? [];
        },
        {
          timeout: 10000,
          message: "completedTours should record the skipped welcome tour",
        },
      )
      .toContain("welcome");

    // Reload: the tour must not auto-start again. The controller decides
    // 800ms after the preferences fetch resolves, so wait for that fetch,
    // give the decision window time to pass, then assert nothing opened.
    await page.reload();
    await page.waitForResponse(
      (res) =>
        res.url().includes("/api/user/preferences") &&
        res.request().method() === "GET",
    );
    await page.waitForTimeout(2500);
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("a new admin visiting /admin for the first time gets the admin tour (after accepting the AUP)", async ({
    browser,
  }) => {
    // Create a brand-new admin through the better-auth admin plugin so the
    // shared seeded admin's tour state is never mutated. The user-create
    // database hook forces the default role, so set the role explicitly after.
    const seededAdminCtx = await browser.newContext({
      storageState: TEST_USERS.admin.authFile,
    });
    const adminApi = await seededAdminCtx.newPage();
    const email = `tour-admin-${Date.now()}@test-seed.local`;
    const password = "TourAdminPass123!";
    let createdUserId = "";

    const userCtx = await browser.newContext();
    try {
      const createRes = await adminApi.request.post(
        "/api/auth/admin/create-user",
        {
          // better-auth rejects cross-origin-less API calls (MISSING_OR_NULL_ORIGIN)
          headers: {
            "Content-Type": "application/json",
            Origin: BASE,
          },
          data: {
            email,
            password,
            name: "Tour Admin E2E",
            role: "admin",
            // sign-in requires a verified email for seeded-style users
            data: { emailVerified: true },
          },
        },
      );
      expect(createRes.ok(), await createRes.text()).toBeTruthy();
      const created = (await createRes.json()) as { user: { id: string } };
      createdUserId = created.user.id;

      const roleRes = await adminApi.request.post("/api/auth/admin/set-role", {
        headers: { "Content-Type": "application/json", Origin: BASE },
        data: { userId: createdUserId, role: "admin" },
      });
      expect(roleRes.ok(), await roleRes.text()).toBeTruthy();

      const page = await userCtx.newPage();
      await signInViaApi(page, { email, password });
      await page.goto("/admin");

      // First-run AUP modal (EU AI Act gate) wins over the tour — accept it.
      const acceptAup = page.getByRole("button", {
        name: "I understand and accept",
      });
      await expect(acceptAup).toBeVisible({ timeout: 15000 });
      await acceptAup.click();
      await expect(acceptAup).not.toBeVisible();

      // The tour controller re-checks the AUP on a 4s poll, then starts the
      // admin tour ~800ms later (app-tours.tsx).
      const adminTour = page.getByRole("dialog", { name: "Admin console" });
      await expect(adminTour).toBeVisible({ timeout: 25000 });
      await expect(page.getByLabel("Step 1 of 5")).toBeVisible();

      // Skip via Esc and confirm persistence of the admin tour.
      await page.keyboard.press("Escape");
      await expect(adminTour).not.toBeVisible();
      await expect
        .poll(
          async () => {
            const res = await page.request.get("/api/user/preferences");
            const current = (await res.json()) as {
              completedTours?: string[];
            };
            return current.completedTours ?? [];
          },
          {
            timeout: 10000,
            message: "completedTours should record the skipped admin tour",
          },
        )
        .toContain("admin");
    } finally {
      // Remove the throwaway admin so reruns stay clean.
      if (createdUserId) {
        await adminApi.request
          .post("/api/auth/admin/remove-user", {
            headers: { "Content-Type": "application/json" },
            data: { userId: createdUserId },
          })
          .catch(() => {});
      }
      await userCtx.close();
      await seededAdminCtx.close();
    }
  });
});
